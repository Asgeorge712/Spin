/** Where workouts are synced to, and the token used to do it. Kept on this device only. */
export interface SyncConfig {
  owner: string;
  repo: string;
  branch: string;
  /** Folder in the repo holding one .json file per workout. */
  folder: string;
  token: string;
}

export interface RemoteFile {
  name: string;
  sha: string;
}

export type SyncErrorKind = "offline" | "auth" | "notfound" | "conflict" | "other";

export class SyncError extends Error {
  constructor(
    readonly kind: SyncErrorKind,
    message: string,
  ) {
    super(message);
  }
}

/** The operations sync needs on the remote folder. */
export interface WorkoutRepo {
  list(): Promise<RemoteFile[]>;
  read(file: RemoteFile): Promise<string>;
  /** Creates (no sha) or updates a file and returns its new blob SHA. */
  write(name: string, content: string, sha: string | undefined, message: string): Promise<string>;
  remove(name: string, sha: string, message: string): Promise<void>;
}

function toBase64(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Talks to the GitHub REST API to read and write the workouts folder. */
export class GitHubWorkoutRepo implements WorkoutRepo {
  constructor(private readonly config: SyncConfig) {}

  private get repoUrl() {
    const { owner, repo } = this.config;
    return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  }

  private fileUrl(name = "") {
    const path = [this.config.folder, name].filter(Boolean).map(encodeURIComponent).join("/");
    return `${this.repoUrl}/contents/${path}`;
  }

  private async request(url: string, init: RequestInit = {}, accept = "application/vnd.github+json"): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        // GitHub responses are cacheable for 60s; a stale listing would look like a conflict.
        cache: "no-store",
        headers: {
          Accept: accept,
          Authorization: `Bearer ${this.config.token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
        },
      });
    } catch {
      throw new SyncError("offline", "Can't reach GitHub. Changes are saved on this device and will sync later.");
    }
    if (res.ok) return res;

    let detail = "";
    try {
      detail = ((await res.json()) as { message?: string }).message ?? "";
    } catch {
      // Not JSON.
    }
    if (res.status === 401) throw new SyncError("auth", "GitHub rejected the token. It may have expired; add a new one.");
    if (res.status === 403) {
      throw new SyncError("auth", `The token isn't allowed to do this. It needs "Contents: Read and write" on the repo. ${detail}`);
    }
    if (res.status === 404) throw new SyncError("notfound", "Not found on GitHub.");
    if (res.status === 409 || res.status === 422) throw new SyncError("conflict", detail || "The file changed on GitHub.");
    throw new SyncError("other", `GitHub error ${res.status}${detail ? `: ${detail}` : ""}`);
  }

  /** Checks the token can see the repo and branch. */
  async verify(): Promise<void> {
    const { branch } = this.config;
    try {
      await this.request(`${this.repoUrl}/branches/${encodeURIComponent(branch)}`);
    } catch (err) {
      if (err instanceof SyncError && err.kind === "notfound") {
        throw new SyncError(
          "notfound",
          `Couldn't find ${this.config.owner}/${this.config.repo} (branch "${branch}"), or the token doesn't have access to it.`,
        );
      }
      throw err;
    }
  }

  async list(): Promise<RemoteFile[]> {
    try {
      const res = await this.request(`${this.fileUrl()}?ref=${encodeURIComponent(this.config.branch)}`);
      const entries = (await res.json()) as { type: string; name: string; sha: string }[];
      if (!Array.isArray(entries)) return [];
      return entries.filter((e) => e.type === "file").map(({ name, sha }) => ({ name, sha }));
    } catch (err) {
      // The folder doesn't exist until the first workout is written.
      if (err instanceof SyncError && err.kind === "notfound") return [];
      throw err;
    }
  }

  async read(file: RemoteFile): Promise<string> {
    // Read by blob SHA so the content always matches the SHA we compare against.
    const res = await this.request(`${this.repoUrl}/git/blobs/${file.sha}`, {}, "application/vnd.github.raw+json");
    return res.text();
  }

  async write(name: string, content: string, sha: string | undefined, message: string): Promise<string> {
    const res = await this.request(this.fileUrl(name), {
      method: "PUT",
      body: JSON.stringify({ message, content: toBase64(content), branch: this.config.branch, ...(sha ? { sha } : {}) }),
    });
    return ((await res.json()) as { content: { sha: string } }).content.sha;
  }

  async remove(name: string, sha: string, message: string): Promise<void> {
    try {
      await this.request(this.fileUrl(name), {
        method: "DELETE",
        body: JSON.stringify({ message, sha, branch: this.config.branch }),
      });
    } catch (err) {
      if (err instanceof SyncError && err.kind === "notfound") return;
      throw err;
    }
  }
}

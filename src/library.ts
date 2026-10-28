import { parseConfigFile, toConfigFile } from "./configFile";
import type { Workout } from "./workout";

/** The public Ride Library: the workouts/ folder of the app's own repo. */
export const LIBRARY = { owner: "Asgeorge712", repo: "Spin", branch: "main", folder: "workouts" };

export function isLibraryRepo(owner: string, repo: string): boolean {
  return owner.toLowerCase() === LIBRARY.owner.toLowerCase() && repo.toLowerCase() === LIBRARY.repo.toLowerCase();
}

/** Short fingerprint of a workout's content (FNV-1a over its config file). */
export function fingerprint(w: Workout): string {
  const text = JSON.stringify(toConfigFile(w));
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export const libraryId = (file: string) => `file:${file.replace(/\.json$/i, "")}`;

export interface LibraryFile {
  name: string;
  content: string;
}

export class LibraryError extends Error {}

async function get(url: string, accept?: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", headers: accept ? { Accept: accept } : {} });
  } catch {
    throw new LibraryError("Can't reach GitHub. Try again when you're online.");
  }
  if (res.status === 403 || res.status === 429) {
    throw new LibraryError("GitHub is limiting requests right now. Try again in a little while.");
  }
  if (!res.ok) throw new LibraryError(`GitHub error ${res.status}.`);
  return res;
}

/**
 * Downloads every ride in the public library. No token: it's a public repo.
 * Uses two API calls (GitHub allows 60 an hour without a token), then fetches
 * the files from raw.githubusercontent.com at that exact commit, so the
 * content is current rather than a cached copy.
 */
export async function fetchLibrary(): Promise<LibraryFile[]> {
  const { owner, repo, branch, folder } = LIBRARY;
  const api = `https://api.github.com/repos/${owner}/${repo}`;
  const commit = (await (await get(`${api}/commits/${branch}`, "application/vnd.github.sha")).text()).trim();
  const entries = (await (await get(`${api}/contents/${folder}?ref=${commit}`)).json()) as { type: string; name: string }[];
  const names = entries.filter((e) => e.type === "file" && e.name.toLowerCase().endsWith(".json")).map((e) => e.name);
  return Promise.all(
    names.map(async (name) => ({
      name,
      content: await (await get(`https://raw.githubusercontent.com/${owner}/${repo}/${commit}/${folder}/${encodeURIComponent(name)}`)).text(),
    })),
  );
}

export interface LibraryUpdate {
  workouts: Workout[];
  added: string[];
  updated: string[];
  /** Rides you've edited here, which were left as they are. */
  keptEdited: string[];
  errors: string[];
}

/**
 * Merges the library into this device's workouts without touching anything
 * that's yours: new rides are added, rides from the library that you haven't
 * edited are updated, and everything else is left alone. Rides you deleted
 * (still waiting in `deletedFiles`) aren't brought back.
 *
 * `fallbackOrigins` gives the fingerprint to compare against for library rides
 * saved before fingerprints existed (the built-in version they started as).
 */
export function mergeLibrary(
  local: Workout[],
  files: LibraryFile[],
  deletedFiles: Set<string>,
  fallbackOrigins: Map<string, string> = new Map(),
): LibraryUpdate {
  const out = [...local];
  const result: LibraryUpdate = { workouts: out, added: [], updated: [], keptEdited: [], errors: [] };

  for (const file of files) {
    let remote: Workout;
    try {
      remote = parseConfigFile(JSON.parse(file.content), file.name.replace(/\.json$/i, ""));
    } catch (err) {
      result.errors.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    const id = libraryId(file.name);
    const remotePrint = fingerprint(remote);
    const i = out.findIndex((w) => w.id === id);

    if (i >= 0) {
      const mine = out[i];
      const minePrint = fingerprint(mine);
      if (minePrint === remotePrint) {
        out[i] = { ...mine, origin: remotePrint };
        continue;
      }
      const origin = mine.origin ?? fallbackOrigins.get(id);
      if (minePrint !== origin) {
        result.keptEdited.push(mine.name);
        continue;
      }
      out[i] = {
        ...remote,
        id,
        file: mine.file ?? file.name,
        sha: mine.sha,
        // If it's synced to your own repo, send the update there too.
        dirty: mine.sha ? true : mine.dirty,
        origin: remotePrint,
      };
      result.updated.push(remote.name);
    } else if (out.some((w) => w.file === file.name) || deletedFiles.has(file.name)) {
      // Your own workout with the same file name, or one you deleted.
      continue;
    } else {
      out.push({ ...remote, id, file: file.name, dirty: false, origin: remotePrint });
      result.added.push(remote.name);
    }
  }
  return result;
}

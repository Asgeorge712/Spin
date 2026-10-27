import { useState, type FormEvent } from "react";
import type { SyncControls, SyncStatus } from "../sync/useSync";

/** The repo workouts sync to unless changed in the form. */
export const DEFAULT_REPO = "Asgeorge712/Spin";
const TOKEN_URL = "https://github.com/settings/personal-access-tokens/new";

function timeAgo(at: number): string {
  const sec = Math.round((Date.now() - at) / 1000);
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  return new Date(at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function statusText(status: SyncStatus, pending: boolean): string {
  switch (status.state) {
    case "off":
      return "Saved on this device only";
    case "syncing":
      return "Syncing…";
    case "offline":
      return pending ? "Offline: changes will sync when you're back online" : "Offline";
    case "error":
      return "Sync problem";
    case "synced":
      if (pending) return "Changes waiting to sync";
      return status.at ? `Synced ${timeAgo(status.at)}` : "Synced";
  }
}

/** Small header badge; clicking it jumps to the sync panel. */
export function SyncBadge({ sync }: { sync: SyncControls }) {
  const { state } = sync.status;
  const tone = state === "error" ? "bad" : state === "offline" || sync.pending ? "warn" : state === "off" ? "" : "good";
  return (
    <a href="#sync" className={`sync-badge ${tone}`}>
      {statusText(sync.status, sync.pending)}
    </a>
  );
}

export function SyncPanel({ sync }: { sync: SyncControls }) {
  const [repo, setRepo] = useState(sync.config ? `${sync.config.owner}/${sync.config.repo}` : DEFAULT_REPO);
  const [branch, setBranch] = useState(sync.config?.branch ?? "main");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const [owner, name] = repo.trim().split("/");
    if (!owner || !name) {
      setFormError('Enter the repository as "owner/name".');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await sync.connect({ owner, repo: name, branch: branch.trim() || "main", folder: "workouts", token: token.trim() });
      setToken("");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (sync.config) {
    const { owner, repo: name, branch: br, folder } = sync.config;
    const { status } = sync;
    return (
      <section className="card sync" id="sync">
        <strong>Sync with GitHub</strong>
        <p className="muted">
          Workouts are saved as files in{" "}
          <a href={`https://github.com/${owner}/${name}/tree/${br}/${folder}`} target="_blank" rel="noreferrer">
            {owner}/{name}/{folder}
          </a>{" "}
          and kept in step on every device you connect.
        </p>
        <p className={`sync-status ${status.state}`}>{statusText(status, sync.pending)}</p>
        {status.state === "error" && <p className="sync-error">{status.message}</p>}
        {status.state === "synced" && status.warnings.length > 0 && (
          <ul className="sync-error">
            {status.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        {sync.conflicts.length > 0 && (
          <p className="sync-note">
            Some workouts were changed on two devices at once. Both versions were kept; the copies from this device are
            named: {sync.conflicts.map((c) => `“${c}”`).join(", ")}.
          </p>
        )}
        <div className="files-actions">
          <button type="button" onClick={sync.syncNow} disabled={status.state === "syncing"}>
            ↻ Sync now
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              if (confirm("Stop syncing on this device? Your workouts stay here, and the token is removed.")) {
                sync.disconnect();
              }
            }}
          >
            Disconnect
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="card sync" id="sync">
      <strong>Sync with GitHub</strong>
      <p className="muted">
        Save every workout as a file in your GitHub repo, so the same workouts are on all your devices. Everything still
        works offline and syncs when you're back online.
      </p>
      <details>
        <summary>How to get a token (once, then paste it on each device)</summary>
        <ol>
          <li>
            Open{" "}
            <a href={TOKEN_URL} target="_blank" rel="noreferrer">
              GitHub → New fine-grained token
            </a>
            .
          </li>
          <li>Give it a name (e.g. “Spin app”) and pick an expiration.</li>
          <li>
            Under <em>Repository access</em>, choose <em>Only select repositories</em> and pick your Spin repo.
          </li>
          <li>
            Under <em>Permissions → Repository permissions</em>, set <em>Contents</em> to <em>Read and write</em>.
          </li>
          <li>Click <em>Generate token</em> and copy it.</li>
        </ol>
        <p className="muted">
          The token is stored only in this browser. Anyone using this device could read it, and it can only change the
          one repo you picked.
        </p>
      </details>
      <form className="sync-form" onSubmit={submit}>
        <label className="field">
          <span>Repository</span>
          <input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/name" autoCapitalize="off" />
        </label>
        <label className="field">
          <span>Branch</span>
          <input value={branch} onChange={(e) => setBranch(e.target.value)} autoCapitalize="off" />
        </label>
        <label className="field sync-token">
          <span>Token</span>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="github_pat_…"
            autoComplete="off"
            autoCapitalize="off"
            required
          />
        </label>
        <button type="submit" className="primary" disabled={busy || !token.trim()}>
          {busy ? "Connecting…" : "Connect"}
        </button>
      </form>
      {formError && <p className="sync-error">{formError}</p>}
    </section>
  );
}

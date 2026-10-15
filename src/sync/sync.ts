import { configFileName, parseConfigFile, toConfigFile } from "../configFile";
import { newId, type Tombstone, type Workout } from "../workout";
import { SyncError, type RemoteFile, type WorkoutRepo } from "./github";

export interface SyncState {
  workouts: Workout[];
  deleted: Tombstone[];
}

export interface SyncOutcome extends SyncState {
  /** Problems with individual files; the rest of the sync still went through. */
  errors: string[];
  /** Workouts saved as "(conflict …)" copies because both sides changed. */
  conflicts: string[];
  /** Set if the sync stopped early (offline, or the token was refused); the rest retries later. */
  stopped?: SyncError;
}

export function serializeWorkout(w: Workout): string {
  return JSON.stringify(toConfigFile(w), null, 2) + "\n";
}

/** Picks a file name for `name` that isn't in `taken` (compared case-insensitively). */
export function uniqueFileName(name: string, taken: Set<string>): string {
  const base = configFileName({ name } as Workout).replace(/\.json$/, "");
  const lower = new Set([...taken].map((t) => t.toLowerCase()));
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? `${base}.json` : `${base}-${n}.json`;
    if (!lower.has(candidate)) return candidate;
  }
}

export function conflictName(name: string, when: Date): string {
  const stamp = when.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return `${name} (conflict ${stamp})`;
}

/**
 * Two-way sync between this device's workouts and the remote folder.
 *
 * - New local workouts are written as new files; local edits update their file.
 * - Files changed remotely replace the unedited local copy; new remote files are added.
 * - Files deleted remotely are removed locally (unless edited here, then re-created).
 * - Local deletions (tombstones) delete the remote file, unless it changed remotely.
 * - If both sides changed a file, the remote version wins and the local version is
 *   saved as a separate "(conflict …)" workout, so nothing is lost.
 *
 * Only a failure to list the folder throws. Per-file failures are reported in
 * `errors`, and losing the connection or token stops early with `stopped`; either
 * way, what got through is kept and the rest is left as it was, to retry later.
 */
export async function syncWorkouts(repo: WorkoutRepo, state: SyncState, now = new Date()): Promise<SyncOutcome> {
  const remoteFiles = (await repo.list()).filter((f) => f.name.toLowerCase().endsWith(".json"));
  const remote = new Map(remoteFiles.map((f) => [f.name, f.sha]));
  const taken = new Set<string>([...remote.keys(), ...state.workouts.flatMap((w) => (w.file ? [w.file] : []))]);
  const handled = new Set<string>();
  const errors: string[] = [];
  const conflicts: string[] = [];
  let stopped: SyncError | undefined;

  /** Runs one remote operation; returns false (and records why) if it failed. */
  const attempt = async (what: string, op: () => Promise<void>): Promise<boolean> => {
    if (stopped) return false;
    try {
      await op();
      return true;
    } catch (err) {
      // No point trying more files without a connection or a working token.
      if (err instanceof SyncError && (err.kind === "offline" || err.kind === "auth")) stopped = err;
      else errors.push(`${what}: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  };

  const pull = async (file: RemoteFile, id?: string): Promise<Workout> => {
    const w = parseConfigFile(JSON.parse(await repo.read(file)), file.name.replace(/\.json$/i, ""));
    return { ...w, id: id ?? w.id, file: file.name, sha: file.sha, dirty: false };
  };

  // 1. Deletions made on this device.
  const deleted: Tombstone[] = [];
  for (const t of state.deleted) {
    const sha = remote.get(t.file);
    if (sha === undefined) continue; // Already gone.
    // Edited on another device after we last saw it: keep their version (pulled below).
    if (t.sha && t.sha !== sha) continue;
    handled.add(t.file);
    const ok = await attempt(`Deleting ${t.file}`, async () => {
      await repo.remove(t.file, sha, `Delete workout ${t.file}`);
      remote.delete(t.file);
    });
    if (!ok) deleted.push(t);
  }

  // 2. Workouts on this device.
  const workouts: Workout[] = [];
  for (const w of state.workouts) {
    if (!w.file) {
      const file = uniqueFileName(w.name, taken);
      taken.add(file);
      const ok = await attempt(`Saving "${w.name}"`, async () => {
        const sha = await repo.write(file, serializeWorkout(w), undefined, `Add workout "${w.name}"`);
        workouts.push({ ...w, file, sha, dirty: false });
      });
      if (!ok) workouts.push(w);
      continue;
    }

    handled.add(w.file);
    const remoteSha = remote.get(w.file);
    const file = w.file;

    if (w.dirty) {
      if (remoteSha === undefined || remoteSha === w.sha) {
        const ok = await attempt(`Saving "${w.name}"`, async () => {
          const sha = await repo.write(file, serializeWorkout(w), remoteSha, `Update workout "${w.name}"`);
          workouts.push({ ...w, sha, dirty: false });
        });
        if (!ok) workouts.push(w);
      } else {
        // Changed on both sides: take theirs, keep ours as a new workout.
        const ok = await attempt(`Saving "${w.name}"`, async () => {
          const theirs = await pull({ name: file, sha: remoteSha }, w.id);
          const mineName = conflictName(w.name, now);
          const mineFile = uniqueFileName(mineName, taken);
          taken.add(mineFile);
          const mine: Workout = { ...w, id: newId(), name: mineName, file: mineFile };
          const sha = await repo.write(mineFile, serializeWorkout(mine), undefined, `Add workout "${mineName}"`);
          workouts.push(theirs, { ...mine, sha, dirty: false });
          conflicts.push(mineName);
        });
        if (!ok) workouts.push(w);
      }
    } else if (remoteSha === undefined) {
      // Deleted on another device.
    } else if (remoteSha === w.sha) {
      workouts.push(w);
    } else {
      const ok = await attempt(`Loading ${file}`, async () => {
        workouts.push(await pull({ name: file, sha: remoteSha }, w.id));
      });
      if (!ok) workouts.push(w);
    }
  }

  // 3. Files that are new to this device.
  for (const [name, sha] of remote) {
    if (handled.has(name)) continue;
    await attempt(`Loading ${name}`, async () => {
      workouts.push(await pull({ name, sha }));
    });
  }

  return { workouts, deleted, errors, conflicts, stopped };
}

/**
 * Applies a sync result to the current state, keeping any edits the user made
 * while the sync was running. `snapshot` is the state the sync started from.
 */
export function mergeSyncResult(current: SyncState, snapshot: SyncState, synced: SyncState): SyncState {
  const before = new Map(snapshot.workouts.map((w) => [w.id, w]));
  const after = new Map(synced.workouts.map((w) => [w.id, w]));
  const currentIds = new Set(current.workouts.map((w) => w.id));
  const deleted = [...synced.deleted, ...current.deleted.filter((t) => !snapshot.deleted.includes(t))];

  const workouts: Workout[] = [];
  for (const cur of current.workouts) {
    const snap = before.get(cur.id);
    if (!snap) {
      workouts.push(cur); // Created during the sync.
      continue;
    }
    const s = after.get(cur.id);
    const editedDuringSync = cur !== snap;
    if (!s) {
      // Deleted remotely; keep it only if it was edited meanwhile.
      if (editedDuringSync) workouts.push({ ...cur, file: undefined, sha: undefined, dirty: true });
      continue;
    }
    workouts.push(editedDuringSync ? { ...cur, file: s.file, sha: s.sha, dirty: true } : s);
  }
  for (const s of synced.workouts) {
    if (!before.has(s.id)) workouts.push(s); // Pulled from remote, or a conflict copy.
  }

  // Workouts deleted during the sync that the sync just gave a file: remove that file too.
  for (const snap of snapshot.workouts) {
    const s = after.get(snap.id);
    if (!currentIds.has(snap.id) && s?.file) {
      const i = deleted.findIndex((t) => t.file === s.file);
      if (i >= 0) deleted.splice(i, 1);
      deleted.push({ file: s.file, sha: s.sha });
    }
  }

  return { workouts, deleted };
}

/** Whether there are local changes waiting to be sent. */
export function hasPendingChanges(state: SyncState): boolean {
  return state.deleted.length > 0 || state.workouts.some((w) => !w.file || w.dirty);
}

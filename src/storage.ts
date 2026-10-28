import { parseConfigFile, toConfigFile } from "./configFile";
import { suggestedSchedule, parseSchedule, type ScheduleState } from "./schedule";
import type { SyncConfig } from "./sync/github";
import { normalizeSet, type Tombstone, type Workout } from "./workout";

const WORKOUTS_KEY = "spin.workouts.v2";
const SEEN_BUILTINS_KEY = "spin.seenBuiltins.v1";
const DELETED_KEY = "spin.deleted.v1";
const SYNC_KEY = "spin.sync.v1";
const SCHEDULE_KEY = "spin.schedule.v1";

/** Workout config files shipped with the app, from the repo's workouts/ folder. */
const builtinFiles = import.meta.glob<unknown>("../workouts/*.json", { eager: true, import: "default" });

export function builtinWorkouts(): Workout[] {
  return Object.entries(builtinFiles)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([path, data]) => {
      const file = path.split("/").pop()!.replace(/\.json$/, "");
      try {
        // Matches the file name in the synced folder, so the first sync links them up.
        return [{ ...parseConfigFile(data, file), id: `file:${file}`, file: `${file}.json` }];
      } catch (err) {
        console.error(`Skipping invalid workout file ${path}:`, err);
        return [];
      }
    });
}

function isWorkout(value: unknown): value is Workout {
  if (!value || typeof value !== "object") return false;
  const w = value as Workout;
  return typeof w.id === "string" && typeof w.name === "string" && Array.isArray(w.sets);
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable (private mode, quota); the app still works in memory.
  }
}

/**
 * Built-ins saved before sync existed don't record their file name. Link them
 * to it so the first sync doesn't upload duplicates, and mark them changed if
 * they were edited, so sync keeps the edits instead of overwriting them.
 */
function linkLegacyBuiltin(w: Workout, builtins: Workout[]): Workout {
  if (w.file || !w.id.startsWith("file:")) return w;
  const original = builtins.find((b) => b.id === w.id);
  const file = `${w.id.slice("file:".length)}.json`;
  const same = original && JSON.stringify(toConfigFile(original)) === JSON.stringify(toConfigFile(w));
  return { ...w, file, dirty: !same };
}

/**
 * Loads the workouts saved on this device. Built-in workout files that this
 * device hasn't seen before are added, so new files in workouts/ show up after
 * an update, while built-ins the user deleted stay deleted. A built-in whose
 * file is already here (because sync downloaded it) isn't added a second time.
 */
export function loadWorkouts(): Workout[] {
  const stored = readJson(WORKOUTS_KEY);
  const builtins = builtinWorkouts();
  const saved = Array.isArray(stored)
    ? stored.filter(isWorkout).map((w) => linkLegacyBuiltin({ ...w, sets: w.sets.map(normalizeSet) }, builtins))
    : [];

  const seenRaw = readJson(SEEN_BUILTINS_KEY);
  const seen = new Set(Array.isArray(seenRaw) ? seenRaw.filter((x) => typeof x === "string") : []);
  const unseen = builtins.filter((w) => !seen.has(w.id));
  if (unseen.length > 0) {
    writeJson(SEEN_BUILTINS_KEY, [...seen, ...unseen.map((w) => w.id)]);
  }
  const deletedRaw = readJson(DELETED_KEY);
  const known = new Set([
    ...saved.map((w) => w.file),
    ...(Array.isArray(deletedRaw) ? deletedRaw.map((t) => (t as { file?: unknown })?.file) : []),
  ]);
  return [...saved, ...unseen.filter((w) => !known.has(w.file))];
}

export function saveWorkouts(workouts: Workout[]): void {
  writeJson(WORKOUTS_KEY, workouts);
}

export function loadDeleted(): Tombstone[] {
  const raw = readJson(DELETED_KEY);
  return Array.isArray(raw) ? raw.filter((t): t is Tombstone => typeof t?.file === "string") : [];
}

export function saveDeleted(deleted: Tombstone[]): void {
  writeJson(DELETED_KEY, deleted);
}

export function loadSyncConfig(): SyncConfig | null {
  const raw = readJson(SYNC_KEY) as Partial<SyncConfig> | null;
  if (!raw || typeof raw.token !== "string" || !raw.token || !raw.owner || !raw.repo) return null;
  return { owner: raw.owner, repo: raw.repo, branch: raw.branch || "main", folder: raw.folder || "workouts", token: raw.token };
}

export function saveSyncConfig(config: SyncConfig | null): void {
  if (config) writeJson(SYNC_KEY, config);
  else {
    try {
      localStorage.removeItem(SYNC_KEY);
    } catch {
      // Ignore.
    }
  }
}

/** The weekly schedule on this device, or the suggested week the first time. */
export function loadSchedule(workouts: Workout[]): ScheduleState {
  const raw = readJson(SCHEDULE_KEY) as { schedule?: unknown; sha?: unknown; dirty?: unknown } | null;
  try {
    if (raw?.schedule) {
      return {
        schedule: parseSchedule({ days: raw.schedule }),
        sha: typeof raw.sha === "string" ? raw.sha : undefined,
        dirty: raw.dirty === true,
      };
    }
  } catch {
    // Fall through to the suggestion.
  }
  // Not marked as changed, so a schedule already synced from another device wins.
  return { schedule: suggestedSchedule(workouts) };
}

export function saveSchedule(state: ScheduleState): void {
  writeJson(SCHEDULE_KEY, state);
}

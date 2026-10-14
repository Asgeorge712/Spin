import { parseConfigFile } from "./configFile";
import { normalizeSet, type Workout } from "./workout";

const WORKOUTS_KEY = "spin.workouts.v2";
const SEEN_BUILTINS_KEY = "spin.seenBuiltins.v1";

/** Workout config files shipped with the app, from the repo's workouts/ folder. */
const builtinFiles = import.meta.glob<unknown>("../workouts/*.json", { eager: true, import: "default" });

export function builtinWorkouts(): Workout[] {
  return Object.entries(builtinFiles)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([path, data]) => {
      const file = path.split("/").pop()!.replace(/\.json$/, "");
      try {
        return [{ ...parseConfigFile(data, file), id: `file:${file}` }];
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
 * Loads the workouts saved on this device. Built-in workout files that this
 * device hasn't seen before are added, so new files in workouts/ show up after
 * an update, while built-ins the user deleted stay deleted.
 */
export function loadWorkouts(): Workout[] {
  const stored = readJson(WORKOUTS_KEY);
  const saved = Array.isArray(stored)
    ? stored.filter(isWorkout).map((w) => ({ ...w, sets: w.sets.map(normalizeSet) }))
    : [];

  const seenRaw = readJson(SEEN_BUILTINS_KEY);
  const seen = new Set(Array.isArray(seenRaw) ? seenRaw.filter((x) => typeof x === "string") : []);
  const fresh = builtinWorkouts().filter((w) => !seen.has(w.id));
  if (fresh.length > 0) {
    writeJson(SEEN_BUILTINS_KEY, [...seen, ...fresh.map((w) => w.id)]);
  }
  return [...saved, ...fresh];
}

export function saveWorkouts(workouts: Workout[]): void {
  writeJson(WORKOUTS_KEY, workouts);
}

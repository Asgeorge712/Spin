import { normalizeSet, type Workout } from "./workout";

const KEY = "spin.workouts.v1";

function isWorkout(value: unknown): value is Workout {
  if (!value || typeof value !== "object") return false;
  const w = value as Workout;
  return typeof w.id === "string" && typeof w.name === "string" && Array.isArray(w.sets);
}

export function loadWorkouts(): Workout[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isWorkout).map((w) => ({ ...w, sets: w.sets.map(normalizeSet) }));
  } catch {
    return [];
  }
}

export function saveWorkouts(workouts: Workout[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(workouts));
  } catch {
    // Storage may be unavailable (private mode, quota); the app still works in memory.
  }
}

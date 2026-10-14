export const MIN_RESISTANCE = 1;
export const MAX_RESISTANCE = 10;
export const MIN_DURATION_SEC = 5;
export const MAX_DURATION_SEC = 60 * 60;

export type Position = "seated" | "standing";

export interface SpinSet {
  id: string;
  label: string;
  durationSec: number;
  resistance: number;
  position: Position;
  /** Target cadence in RPM; optional. */
  cadence?: number;
}

export interface Workout {
  id: string;
  name: string;
  sets: SpinSet[];
  updatedAt: number;
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function createSet(overrides: Partial<SpinSet> = {}): SpinSet {
  return {
    id: newId(),
    label: "Steady",
    durationSec: 60,
    resistance: 4,
    position: "seated",
    ...overrides,
  };
}

export function createWorkout(name = "New workout", sets: SpinSet[] = [createSet()]): Workout {
  return { id: newId(), name, sets, updatedAt: Date.now() };
}

/** Clamps a set's numeric fields into the allowed ranges. */
export function normalizeSet(set: SpinSet): SpinSet {
  return {
    ...set,
    durationSec: Math.round(clamp(set.durationSec, MIN_DURATION_SEC, MAX_DURATION_SEC)),
    resistance: Math.round(clamp(set.resistance, MIN_RESISTANCE, MAX_RESISTANCE)),
    cadence: set.cadence === undefined ? undefined : Math.round(clamp(set.cadence, 30, 140)),
  };
}

export function totalDuration(sets: SpinSet[]): number {
  return sets.reduce((sum, s) => sum + s.durationSec, 0);
}

/** Time-weighted average resistance across the workout. */
export function averageResistance(sets: SpinSet[]): number {
  const total = totalDuration(sets);
  if (total === 0) return 0;
  return sets.reduce((sum, s) => sum + s.resistance * s.durationSec, 0) / total;
}

/** Formats seconds as m:ss, or h:mm:ss past an hour. */
export function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Parses "90", "1:30" or "1:02:30" into seconds. Returns null if invalid. */
export function parseDuration(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+(:\d{1,2}){0,2}$/.test(trimmed)) return null;
  const parts = trimmed.split(":").map(Number);
  if (parts.slice(1).some((p) => p >= 60)) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

export interface RideState {
  index: number;
  set: SpinSet;
  /** Seconds remaining in the current set. */
  remainingInSet: number;
  /** Seconds remaining in the whole workout. */
  remainingTotal: number;
  next?: SpinSet;
  done: boolean;
}

/** Works out which set is active `elapsedSec` seconds into the workout. */
export function rideStateAt(sets: SpinSet[], elapsedSec: number): RideState | null {
  if (sets.length === 0) return null;
  const total = totalDuration(sets);
  let start = 0;
  for (let i = 0; i < sets.length; i++) {
    const end = start + sets[i].durationSec;
    if (elapsedSec < end) {
      return {
        index: i,
        set: sets[i],
        remainingInSet: end - elapsedSec,
        remainingTotal: total - elapsedSec,
        next: sets[i + 1],
        done: false,
      };
    }
    start = end;
  }
  const last = sets.length - 1;
  return { index: last, set: sets[last], remainingInSet: 0, remainingTotal: 0, done: true };
}

export function presetWorkouts(): Workout[] {
  return [
    createWorkout("20-min Intervals", [
      createSet({ label: "Warm-up", durationSec: 180, resistance: 3, cadence: 85 }),
      ...Array.from({ length: 6 }, (_, i) => [
        createSet({ label: `Push ${i + 1}`, durationSec: 60, resistance: 8, position: "standing", cadence: 70 }),
        createSet({ label: "Recover", durationSec: 90, resistance: 3, cadence: 90 }),
      ]).flat(),
      createSet({ label: "Cool-down", durationSec: 120, resistance: 2, cadence: 80 }),
    ]),
    createWorkout("Hill Climb", [
      createSet({ label: "Warm-up", durationSec: 240, resistance: 3, cadence: 90 }),
      createSet({ label: "Base", durationSec: 120, resistance: 5, cadence: 80 }),
      createSet({ label: "Climb", durationSec: 120, resistance: 6, cadence: 75 }),
      createSet({ label: "Steeper", durationSec: 120, resistance: 7, cadence: 70 }),
      createSet({ label: "Summit", durationSec: 90, resistance: 9, position: "standing", cadence: 60 }),
      createSet({ label: "Descent", durationSec: 180, resistance: 3, cadence: 95 }),
      createSet({ label: "Cool-down", durationSec: 180, resistance: 2, cadence: 80 }),
    ]),
  ];
}

export const MIN_RESISTANCE = 0;
export const MAX_RESISTANCE = 100;
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
  /** File name in the synced workouts/ folder, once it has one. */
  file?: string;
  /** Git blob SHA of the file as last synced. */
  sha?: string;
  /** Changed on this device since the last sync. */
  dirty?: boolean;
  /**
   * Fingerprint of the version of Paul's ride this came from (a built-in, or
   * "Get Paul's latest rides"). If the workout no longer matches it, it has
   * been edited here and library updates leave it alone.
   */
  origin?: string;
}

/** A synced workout file that was deleted on this device and must be removed remotely. */
export interface Tombstone {
  file: string;
  sha?: string;
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
    resistance: 40,
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

/** Name for the copy made when resistance is changed mid-ride. */
export function rideCopyName(name: string, when: Date): string {
  const stamp = when.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${name} (ride ${stamp})`;
}

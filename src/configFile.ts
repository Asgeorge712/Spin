import {
  MAX_DURATION_SEC,
  MAX_RESISTANCE,
  MIN_DURATION_SEC,
  MIN_RESISTANCE,
  createWorkout,
  formatDuration,
  newId,
  parseDuration,
  type SpinSet,
  type Workout,
} from "./workout";

export const CONFIG_FORMAT = "spin-workout";
export const CONFIG_VERSION = 1;

/** One set as written in a workout config file. */
export interface ConfigSet {
  label?: string;
  /** "m:ss", "h:mm:ss", or a number of seconds. */
  duration: string | number;
  resistance: number;
  position?: "seated" | "standing";
  cadence?: number;
}

/** The on-disk shape of a workout config (.json) file. */
export interface ConfigFile {
  format: typeof CONFIG_FORMAT;
  version: number;
  name: string;
  sets: ConfigSet[];
}

export function toConfigFile(workout: Workout): ConfigFile {
  return {
    format: CONFIG_FORMAT,
    version: CONFIG_VERSION,
    name: workout.name,
    sets: workout.sets.map((s) => ({
      label: s.label,
      duration: formatDuration(s.durationSec),
      resistance: s.resistance,
      position: s.position,
      ...(s.cadence === undefined ? {} : { cadence: s.cadence }),
    })),
  };
}

export function configFileName(workout: Workout): string {
  const slug = workout.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "workout"}.json`;
}

function parseSet(raw: unknown, n: number): SpinSet {
  if (!raw || typeof raw !== "object") throw new Error(`Set ${n}: must be an object`);
  const s = raw as Record<string, unknown>;

  const durationSec =
    typeof s.duration === "number" ? s.duration : typeof s.duration === "string" ? parseDuration(s.duration) : null;
  if (durationSec === null || !Number.isFinite(durationSec)) {
    throw new Error(`Set ${n}: "duration" must be like "1:30" or a number of seconds`);
  }
  if (durationSec < MIN_DURATION_SEC || durationSec > MAX_DURATION_SEC) {
    throw new Error(`Set ${n}: duration must be between ${MIN_DURATION_SEC}s and ${formatDuration(MAX_DURATION_SEC)}`);
  }

  if (typeof s.resistance !== "number" || s.resistance < MIN_RESISTANCE || s.resistance > MAX_RESISTANCE) {
    throw new Error(`Set ${n}: "resistance" must be a number from ${MIN_RESISTANCE} to ${MAX_RESISTANCE}`);
  }

  if (s.position !== undefined && s.position !== "seated" && s.position !== "standing") {
    throw new Error(`Set ${n}: "position" must be "seated" or "standing"`);
  }

  if (s.cadence !== undefined && typeof s.cadence !== "number") {
    throw new Error(`Set ${n}: "cadence" must be a number`);
  }

  return {
    id: newId(),
    label: typeof s.label === "string" && s.label.trim() ? s.label : `Set ${n}`,
    durationSec: Math.round(durationSec),
    resistance: Math.round(s.resistance),
    position: s.position ?? "seated",
    cadence: s.cadence === undefined ? undefined : Math.round(s.cadence),
  };
}

/**
 * Validates parsed JSON from a workout config file and turns it into a Workout.
 * Throws an Error with a readable message when the file is invalid.
 */
export function parseConfigFile(data: unknown, fallbackName = "Imported workout"): Workout {
  if (!data || typeof data !== "object") throw new Error("File is not a workout config object");
  const d = data as Record<string, unknown>;
  if (d.format !== undefined && d.format !== CONFIG_FORMAT) {
    throw new Error(`Unknown format "${String(d.format)}"`);
  }
  if (typeof d.version === "number" && d.version > CONFIG_VERSION) {
    throw new Error(`File version ${d.version} is newer than this app supports (${CONFIG_VERSION})`);
  }
  if (!Array.isArray(d.sets) || d.sets.length === 0) throw new Error('"sets" must be a non-empty list');

  const name = typeof d.name === "string" && d.name.trim() ? d.name : fallbackName;
  return createWorkout(
    name,
    d.sets.map((s, i) => parseSet(s, i + 1)),
  );
}

import type { Workout } from "./workout";

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAYS)[number];

export const DAY_NAMES: Record<DayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

/**
 * Which workout to ride each day, or null for a rest day. Workouts are
 * referenced by file name (the same on every synced device), or by id for a
 * workout that hasn't been given a file yet.
 */
export type Schedule = Record<DayKey, string | null>;

/** The schedule plus its sync state, as kept on this device. */
export interface ScheduleState {
  schedule: Schedule;
  /** Git blob SHA of the schedule file as last synced. */
  sha?: string;
  /** Changed on this device since the last sync. */
  dirty?: boolean;
}

export const SCHEDULE_FORMAT = "spin-schedule";
/** Synced to <repo>/schedule/week.json, outside workouts/ so it isn't read as a workout. */
export const SCHEDULE_FOLDER = "schedule";
export const SCHEDULE_FILE = "week.json";

/** The suggested 80/20 week: mostly easy and endurance riding, two hard days apart. */
const SUGGESTED: Schedule = {
  mon: "endurance-45.json",
  tue: "30-30s.json",
  wed: "easy-spin-30.json",
  thu: "sweet-spot-3x10.json",
  fri: null,
  sat: "endurance-45.json",
  sun: "twin-hills-30.json",
};

/** The suggested week, leaving out workouts that aren't on this device. */
export function suggestedSchedule(workouts: Workout[]): Schedule {
  const files = new Set(workouts.map((w) => w.file));
  return Object.fromEntries(DAYS.map((d) => [d, SUGGESTED[d] && files.has(SUGGESTED[d]) ? SUGGESTED[d] : null])) as Schedule;
}

/** Today's date as YYYY-MM-DD in local time, for choices that only last a day. */
export function localDate(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function todayKey(now = new Date()): DayKey {
  // getDay(): 0 = Sunday.
  return DAYS[(now.getDay() + 6) % 7];
}

/** The key a schedule uses to refer to a workout. */
export function workoutKey(w: Workout): string {
  return w.file ?? w.id;
}

export function findScheduled(workouts: Workout[], key: string | null): Workout | undefined {
  if (!key) return undefined;
  return workouts.find((w) => w.file === key) ?? workouts.find((w) => w.id === key);
}

export function serializeSchedule(schedule: Schedule): string {
  return JSON.stringify({ format: SCHEDULE_FORMAT, version: 1, days: schedule }, null, 2) + "\n";
}

/** Reads a schedule file, ignoring anything it doesn't recognise. */
export function parseSchedule(data: unknown): Schedule {
  const days = (data as { days?: Record<string, unknown> } | null)?.days;
  if (!days || typeof days !== "object") throw new Error("Not a weekly schedule file");
  return Object.fromEntries(DAYS.map((d) => [d, typeof days[d] === "string" && days[d] ? days[d] : null])) as Schedule;
}

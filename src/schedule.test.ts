import { describe, expect, it } from "vitest";
import { findScheduled, parseSchedule, serializeSchedule, suggestedSchedule, todayKey } from "./schedule";
import { SyncError, type RemoteFile, type WorkoutRepo } from "./sync/github";
import { syncSchedule } from "./sync/scheduleSync";
import { createWorkout } from "./workout";

const withFile = (name: string, file?: string) => ({ ...createWorkout(name), ...(file ? { file } : {}) });

describe("schedule", () => {
  it("maps dates to Monday-first day keys", () => {
    expect(todayKey(new Date(2026, 9, 26))).toBe("mon"); // Mon 26 Oct 2026
    expect(todayKey(new Date(2026, 10, 1))).toBe("sun");
  });

  it("suggests the 80/20 week using only workouts that are present", () => {
    const s = suggestedSchedule([withFile("Endurance 45", "endurance-45.json"), withFile("30/30s", "30-30s.json")]);
    expect(s).toEqual({ mon: "endurance-45.json", tue: "30-30s.json", wed: null, thu: null, fri: null, sat: "endurance-45.json", sun: null });
  });

  it("finds workouts by file name, or by id before they have a file", () => {
    const a = withFile("A", "a.json");
    const b = withFile("B");
    expect(findScheduled([a, b], "a.json")).toBe(a);
    expect(findScheduled([a, b], b.id)).toBe(b);
    expect(findScheduled([a, b], "gone.json")).toBeUndefined();
    expect(findScheduled([a, b], null)).toBeUndefined();
  });

  it("round-trips the file format and ignores junk", () => {
    const s = suggestedSchedule([withFile("E", "endurance-45.json")]);
    expect(parseSchedule(JSON.parse(serializeSchedule(s)))).toEqual(s);
    expect(parseSchedule({ days: { mon: "x.json", tue: 5, extra: "y" } })).toMatchObject({ mon: "x.json", tue: null, sun: null });
    expect(() => parseSchedule({ nope: 1 })).toThrow();
  });
});

class OneFileRepo implements WorkoutRepo {
  file: { sha: string; content: string } | null = null;
  writes = 0;
  async list(): Promise<RemoteFile[]> {
    return this.file ? [{ name: "week.json", sha: this.file.sha }] : [];
  }
  async read() {
    return this.file!.content;
  }
  async write(_name: string, content: string, sha: string | undefined) {
    if (this.file?.sha !== sha) throw new SyncError("conflict", "sha mismatch");
    this.file = { sha: `sha${++this.writes}`, content };
    return this.file.sha;
  }
  async remove() {}
}

describe("syncSchedule", () => {
  const week = suggestedSchedule([withFile("E", "endurance-45.json")]);

  it("doesn't upload an unchanged suggestion, so another device's schedule wins", async () => {
    const repo = new OneFileRepo();
    expect(await syncSchedule(repo, { schedule: week })).toEqual({ schedule: week });
    expect(repo.writes).toBe(0);

    repo.file = { sha: "theirs", content: serializeSchedule({ ...week, fri: "x.json" }) };
    const pulled = await syncSchedule(repo, { schedule: week });
    expect(pulled).toEqual({ schedule: { ...week, fri: "x.json" }, sha: "theirs", dirty: false });
  });

  it("sends local changes, replacing the remote file", async () => {
    const repo = new OneFileRepo();
    const created = await syncSchedule(repo, { schedule: week, dirty: true });
    expect(created).toMatchObject({ dirty: false, sha: "sha1" });

    repo.file = { sha: "changed-elsewhere", content: serializeSchedule(week) };
    const mine = { ...week, wed: "mine.json" };
    const sent = await syncSchedule(repo, { schedule: mine, sha: "sha1", dirty: true });
    expect(sent.dirty).toBe(false);
    expect(parseSchedule(JSON.parse(repo.file!.content)).wed).toBe("mine.json");
  });
});

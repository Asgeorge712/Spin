import { describe, expect, it } from "vitest";
import { fingerprint, isLibraryRepo, mergeLibrary, type LibraryFile } from "./library";
import { serializeWorkout } from "./sync/sync";
import { createSet, createWorkout, type Workout } from "./workout";

const ride = (name: string, resistance: number) => createWorkout(name, [createSet({ label: "A", durationSec: 60, resistance })]);
const file = (name: string, w: Workout): LibraryFile => ({ name, content: serializeWorkout(w) });
/** A library ride as it sits on a device: id file:<name>, with its fingerprint. */
const fromLibrary = (name: string, w: Workout): Workout => ({ ...w, id: `file:${name.replace(".json", "")}`, file: name, origin: fingerprint(w) });

describe("mergeLibrary", () => {
  it("adds rides that are new to this device", () => {
    const r = mergeLibrary([], [file("tempo.json", ride("Tempo", 40))], new Set());
    expect(r.added).toEqual(["Tempo"]);
    expect(r.workouts[0]).toMatchObject({ id: "file:tempo", file: "tempo.json", name: "Tempo", dirty: false });
  });

  it("updates library rides you haven't edited, and keeps ones you have", () => {
    const climb = fromLibrary("climb.json", ride("Climb", 40));
    const intervals = fromLibrary("intervals.json", ride("Intervals", 50));
    const editedIntervals = { ...intervals, sets: [createSet({ resistance: 30 })], dirty: true };

    const r = mergeLibrary(
      [climb, editedIntervals],
      [file("climb.json", ride("Climb", 45)), file("intervals.json", ride("Intervals", 55))],
      new Set(),
    );
    expect(r.updated).toEqual(["Climb"]);
    expect(r.keptEdited).toEqual(["Intervals"]);
    expect(r.workouts[0].id).toBe(climb.id); // Same workout, so the schedule and selection still point at it.
    expect(r.workouts[0].sets[0].resistance).toBe(45);
    expect(r.workouts[1]).toBe(editedIntervals);
  });

  it("reports nothing when everything is current", () => {
    const climb = fromLibrary("climb.json", ride("Climb", 40));
    const r = mergeLibrary([climb], [file("climb.json", ride("Climb", 40))], new Set());
    expect([r.added, r.updated, r.keptEdited]).toEqual([[], [], []]);
  });

  it("never touches your own workouts, or brings back ones you deleted", () => {
    const mine = { ...ride("My Climb", 33), file: "climb.json" }; // Same file name, not from the library.
    const r = mergeLibrary([mine], [file("climb.json", ride("Climb", 40)), file("gone.json", ride("Gone", 40))], new Set(["gone.json"]));
    expect(r.workouts).toEqual([mine]);
    expect(r.added).toEqual([]);
  });

  it("uses the built-in version to judge rides saved before fingerprints", () => {
    const original = ride("Climb", 40);
    const old = { ...fromLibrary("climb.json", original), origin: undefined };
    const r = mergeLibrary([old], [file("climb.json", ride("Climb", 45))], new Set(), new Map([["file:climb", fingerprint(original)]]));
    expect(r.updated).toEqual(["Climb"]);
  });

  it("marks updates to a ride synced to your own repo so they're sent there", () => {
    const synced = { ...fromLibrary("climb.json", ride("Climb", 40)), sha: "abc" };
    const r = mergeLibrary([synced], [file("climb.json", ride("Climb", 45))], new Set());
    expect(r.workouts[0]).toMatchObject({ sha: "abc", dirty: true });
  });

  it("reports unreadable files and carries on", () => {
    const r = mergeLibrary([], [{ name: "bad.json", content: "{" }, file("ok.json", ride("Ok", 30))], new Set());
    expect(r.added).toEqual(["Ok"]);
    expect(r.errors[0]).toMatch(/bad\.json/);
  });

  it("recognises the library repo", () => {
    expect(isLibraryRepo("asgeorge712", "SPIN")).toBe(true);
    expect(isLibraryRepo("someone", "Spin")).toBe(false);
  });
});

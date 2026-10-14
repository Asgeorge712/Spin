import { describe, expect, it } from "vitest";
import { configFileName, parseConfigFile, toConfigFile } from "./configFile";
import { builtinWorkouts } from "./storage";
import { createSet, createWorkout } from "./workout";

describe("config files", () => {
  it("round-trips a workout", () => {
    const w = createWorkout("Tempo", [
      createSet({ label: "Go", durationSec: 90, resistance: 65, position: "standing", cadence: 80 }),
      createSet({ label: "Easy", durationSec: 3600, resistance: 0 }),
    ]);
    const back = parseConfigFile(JSON.parse(JSON.stringify(toConfigFile(w))));
    expect(back.name).toBe("Tempo");
    expect(back.sets.map(({ id: _id, ...s }) => s)).toEqual(w.sets.map(({ id: _id, ...s }) => s));
  });

  it("accepts durations in seconds and fills defaults", () => {
    const w = parseConfigFile({ sets: [{ duration: 45, resistance: 100 }] }, "fallback");
    expect(w.name).toBe("fallback");
    expect(w.sets[0]).toMatchObject({ label: "Set 1", durationSec: 45, resistance: 100, position: "seated" });
  });

  it("rejects invalid files with a useful message", () => {
    expect(() => parseConfigFile(null)).toThrow(/not a workout/);
    expect(() => parseConfigFile({ sets: [] })).toThrow(/non-empty/);
    expect(() => parseConfigFile({ sets: [{ duration: "1:00", resistance: 101 }] })).toThrow(/Set 1.*0 to 100/);
    expect(() => parseConfigFile({ sets: [{ duration: "abc", resistance: 5 }] })).toThrow(/Set 1.*duration/);
    expect(() => parseConfigFile({ format: "other", sets: [{ duration: 60, resistance: 5 }] })).toThrow(/format/);
  });

  it("makes safe file names", () => {
    expect(configFileName(createWorkout("Hill Climb (ride Oct 14, 6:05 PM)"))).toBe("hill-climb-ride-oct-14-6-05-pm.json");
    expect(configFileName(createWorkout("!!!"))).toBe("workout.json");
  });

  it("loads every built-in workout file", () => {
    const builtins = builtinWorkouts();
    expect(builtins.map((w) => w.id)).toEqual(["file:20-min-intervals", "file:hill-climb"]);
    expect(builtins.every((w) => w.sets.length > 0)).toBe(true);
  });
});

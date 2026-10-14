import { describe, expect, it } from "vitest";
import {
  averageResistance,
  createSet,
  formatDuration,
  normalizeSet,
  parseDuration,
  rideStateAt,
  totalDuration,
} from "./workout";

describe("duration helpers", () => {
  it("formats seconds", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(90)).toBe("1:30");
    expect(formatDuration(3725)).toBe("1:02:05");
  });

  it("parses durations", () => {
    expect(parseDuration("90")).toBe(90);
    expect(parseDuration("1:30")).toBe(90);
    expect(parseDuration("1:02:05")).toBe(3725);
    expect(parseDuration("1:75")).toBeNull();
    expect(parseDuration("abc")).toBeNull();
    expect(parseDuration("")).toBeNull();
  });
});

describe("workout math", () => {
  const sets = [
    createSet({ durationSec: 60, resistance: 2 }),
    createSet({ durationSec: 120, resistance: 8 }),
  ];

  it("totals duration", () => {
    expect(totalDuration(sets)).toBe(180);
  });

  it("time-weights average resistance", () => {
    expect(averageResistance(sets)).toBe(6);
    expect(averageResistance([])).toBe(0);
  });

  it("clamps out-of-range values", () => {
    const s = normalizeSet(createSet({ durationSec: 1, resistance: 99 }));
    expect(s.durationSec).toBe(5);
    expect(s.resistance).toBe(10);
  });
});

describe("rideStateAt", () => {
  const sets = [createSet({ durationSec: 60 }), createSet({ durationSec: 30 })];

  it("finds the active set", () => {
    expect(rideStateAt(sets, 0)).toMatchObject({ index: 0, remainingInSet: 60, remainingTotal: 90 });
    expect(rideStateAt(sets, 59)).toMatchObject({ index: 0, remainingInSet: 1 });
    expect(rideStateAt(sets, 60)).toMatchObject({ index: 1, remainingInSet: 30, next: undefined });
  });

  it("reports completion", () => {
    expect(rideStateAt(sets, 90)?.done).toBe(true);
    expect(rideStateAt([], 0)).toBeNull();
  });
});

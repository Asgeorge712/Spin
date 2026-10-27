import { describe, expect, it } from "vitest";
import { resistanceColor } from "./colors";

const hue = (r: number) => Number(resistanceColor(r).match(/^hsl\((\d+)/)![1]);

describe("resistanceColor", () => {
  it("is full green at or below 25 and full red at or above 55", () => {
    expect([0, 10, 25].map(hue)).toEqual([140, 140, 140]);
    expect([55, 70, 100].map(hue)).toEqual([0, 0, 0]);
  });

  it("blends evenly in between", () => {
    expect(hue(40)).toBe(70);
    expect(hue(30)).toBeGreaterThan(hue(35));
  });
});

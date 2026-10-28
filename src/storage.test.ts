import { beforeEach, describe, expect, it } from "vitest";
import { builtinWorkouts, loadWorkouts } from "./storage";

const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
});

describe("loadWorkouts", () => {
  beforeEach(() => store.clear());

  it("adds the built-in workouts on first run", () => {
    expect(loadWorkouts().map((w) => w.file).sort()).toEqual(builtinWorkouts().map((w) => w.file).sort());
  });

  it("doesn't add a built-in again when sync already downloaded its file", () => {
    const [first, ...rest] = builtinWorkouts();
    const synced = { ...first, id: "from-sync", sha: "abc" };
    store.set("spin.workouts.v2", JSON.stringify([synced]));
    store.set("spin.seenBuiltins.v1", JSON.stringify(rest.map((w) => w.id))); // `first` is new to this device

    const loaded = loadWorkouts();
    expect(loaded.filter((w) => w.file === first.file).map((w) => w.id)).toEqual(["from-sync"]);
    // And it's remembered as seen, so it isn't considered again.
    expect(JSON.parse(store.get("spin.seenBuiltins.v1")!)).toContain(first.id);
  });

  it("doesn't bring back a built-in that is waiting to be deleted", () => {
    const [first] = builtinWorkouts();
    store.set("spin.deleted.v1", JSON.stringify([{ file: first.file, sha: "x" }]));
    expect(loadWorkouts().some((w) => w.file === first.file)).toBe(false);
  });
});

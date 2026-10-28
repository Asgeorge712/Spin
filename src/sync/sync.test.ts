import { describe, expect, it } from "vitest";
import { createSet, createWorkout, type Workout } from "../workout";
import { SyncError, type RemoteFile, type WorkoutRepo } from "./github";
import { hasPendingChanges, mergeSyncResult, serializeWorkout, syncWorkouts, uniqueFileName, type SyncState } from "./sync";

/** In-memory stand-in for the GitHub folder, with git-like SHA checks. */
class FakeRepo implements WorkoutRepo {
  files = new Map<string, { sha: string; content: string }>();
  private n = 0;
  offlineAfter = Infinity;
  calls = 0;

  private tick() {
    if (++this.calls > this.offlineAfter) throw new SyncError("offline", "offline");
  }

  put(name: string, w: Workout) {
    const sha = `sha${++this.n}`;
    this.files.set(name, { sha, content: serializeWorkout(w) });
    return sha;
  }

  async list(): Promise<RemoteFile[]> {
    this.tick();
    return [...this.files].map(([name, f]) => ({ name, sha: f.sha }));
  }

  async read(file: RemoteFile) {
    this.tick();
    const f = [...this.files.values()].find((x) => x.sha === file.sha);
    if (!f) throw new SyncError("notfound", "no blob");
    return f.content;
  }

  async write(name: string, content: string, sha: string | undefined) {
    this.tick();
    const existing = this.files.get(name);
    if (existing?.sha !== sha) throw new SyncError("conflict", "sha mismatch");
    const newSha = `sha${++this.n}`;
    this.files.set(name, { sha: newSha, content });
    return newSha;
  }

  async remove(name: string, sha: string) {
    this.tick();
    if (this.files.get(name)?.sha !== sha) throw new SyncError("conflict", "sha mismatch");
    this.files.delete(name);
  }

  names() {
    return [...this.files.keys()].sort();
  }

  json(name: string) {
    return JSON.parse(this.files.get(name)!.content);
  }
}

const workout = (name: string, resistance = 50) =>
  createWorkout(name, [createSet({ label: "A", durationSec: 60, resistance })]);

const state = (workouts: Workout[], deleted: SyncState["deleted"] = []): SyncState => ({ workouts, deleted });

/** Syncs and applies the result, like the app does. */
async function sync(repo: FakeRepo, s: SyncState) {
  const out = await syncWorkouts(repo, s);
  return { ...mergeSyncResult(s, s, out), errors: out.errors, conflicts: out.conflicts, stopped: out.stopped };
}

describe("syncWorkouts", () => {
  it("uploads new workouts as files and records their SHA", async () => {
    const repo = new FakeRepo();
    const res = await sync(repo, state([workout("Hill Climb"), workout("Hill Climb")]));
    expect(repo.names()).toEqual(["hill-climb-2.json", "hill-climb.json"]);
    expect(res.workouts.every((w) => w.file && w.sha && !w.dirty)).toBe(true);
    expect(hasPendingChanges(res)).toBe(false);
  });

  it("downloads files it hasn't seen and keeps unchanged ones as-is", async () => {
    const repo = new FakeRepo();
    repo.put("tempo.json", workout("Tempo", 70));
    const first = await sync(repo, state([]));
    expect(first.workouts.map((w) => [w.name, w.sets[0].resistance])).toEqual([["Tempo", 70]]);
    const second = await sync(repo, first);
    expect(second.workouts[0]).toBe(first.workouts[0]);
  });

  it("pushes local edits and pulls remote edits", async () => {
    const repo = new FakeRepo();
    const s1 = await sync(repo, state([workout("Mine"), workout("Theirs")]));

    // Edit "Mine" here, and "Theirs" on another device.
    const edited = { ...s1.workouts[0], sets: [createSet({ resistance: 90 })], dirty: true };
    repo.put("theirs.json", workout("Theirs", 10));

    const s2 = await sync(repo, state([edited, s1.workouts[1]]));
    expect(repo.json("mine.json").sets[0].resistance).toBe(90);
    expect(s2.workouts.find((w) => w.name === "Theirs")!.sets[0].resistance).toBe(10);
    // The pulled workout keeps its id, so it stays selected in the app.
    expect(s2.workouts[1].id).toBe(s1.workouts[1].id);
  });

  it("keeps both versions when a file changed on both sides", async () => {
    const repo = new FakeRepo();
    const s1 = await sync(repo, state([workout("Climb", 50)]));
    repo.put("climb.json", workout("Climb", 20));
    const local = { ...s1.workouts[0], sets: [createSet({ resistance: 80 })], dirty: true };

    const s2 = await sync(repo, state([local]));
    expect(s2.conflicts).toHaveLength(1);
    expect(s2.workouts.map((w) => w.sets[0].resistance)).toEqual([20, 80]);
    expect(s2.workouts[1].name).toMatch(/^Climb \(conflict /);
    expect(repo.names()).toHaveLength(2);
    expect(repo.json("climb.json").sets[0].resistance).toBe(20);
  });

  it("deletes remote files for local deletions, but not if they changed remotely", async () => {
    const repo = new FakeRepo();
    const s1 = await sync(repo, state([workout("A"), workout("B")]));
    const [a, b] = s1.workouts;
    repo.put("b.json", workout("B", 99)); // B edited elsewhere.

    const s2 = await sync(
      repo,
      state([], [
        { file: a.file!, sha: a.sha },
        { file: b.file!, sha: b.sha },
      ]),
    );
    expect(repo.names()).toEqual(["b.json"]);
    expect(s2.workouts.map((w) => w.name)).toEqual(["B"]);
    expect(s2.deleted).toEqual([]);
  });

  it("removes local workouts whose file was deleted elsewhere, unless edited here", async () => {
    const repo = new FakeRepo();
    const s1 = await sync(repo, state([workout("Gone"), workout("Edited")]));
    repo.files.clear();
    const edited = { ...s1.workouts[1], name: "Edited", dirty: true };

    const s2 = await sync(repo, state([s1.workouts[0], edited]));
    expect(s2.workouts.map((w) => w.name)).toEqual(["Edited"]);
    expect(repo.names()).toEqual(["edited.json"]);
  });

  it("uploads never-synced rides to your own repo, but treats them as deleted in the library repo", async () => {
    const builtIn = { ...workout("Climb"), file: "climb.json" }; // Has a file name, never synced.

    const own = new FakeRepo();
    const out = await syncWorkouts(own, state([builtIn]), new Date(), { uploadUnsynced: true });
    expect(own.names()).toEqual(["climb.json"]);
    expect(out.workouts[0]).toMatchObject({ file: "climb.json", dirty: false });
    expect(out.workouts[0].sha).toBeTruthy();

    const library = new FakeRepo();
    const out2 = await syncWorkouts(library, state([builtIn]));
    expect(library.names()).toEqual([]);
    expect(out2.workouts).toEqual([]);
  });

  it("keeps what got through when the connection drops partway", async () => {
    const repo = new FakeRepo();
    repo.offlineAfter = 2; // list + one write succeed.
    const res = await sync(repo, state([workout("One"), workout("Two")]));
    expect(res.workouts[0]).toMatchObject({ file: "one.json", dirty: false });
    expect(res.workouts[1].file).toBeUndefined();
    expect(res.stopped?.kind).toBe("offline");
    expect(hasPendingChanges(res)).toBe(true);

    repo.offlineAfter = Infinity;
    const retry = await sync(repo, res);
    expect(repo.names()).toEqual(["one.json", "two.json"]);
    expect(hasPendingChanges(retry)).toBe(false);
  });

  it("stops at the first refused write instead of trying every file", async () => {
    const repo = new FakeRepo();
    repo.write = async () => {
      throw new SyncError("auth", "no write access");
    };
    const res = await sync(repo, state([workout("One"), workout("Two")]));
    expect(res.stopped?.kind).toBe("auth");
    expect(repo.calls).toBe(1); // Just the listing.
    expect(hasPendingChanges(res)).toBe(true);
  });

  it("throws when the folder can't be listed at all", async () => {
    const repo = new FakeRepo();
    repo.offlineAfter = 0;
    await expect(syncWorkouts(repo, state([workout("X")]))).rejects.toMatchObject({ kind: "offline" });
  });

  it("reports invalid remote files without failing the sync", async () => {
    const repo = new FakeRepo();
    repo.files.set("broken.json", { sha: "x", content: "{ nope" });
    repo.put("ok.json", workout("Ok"));
    const res = await sync(repo, state([]));
    expect(res.workouts.map((w) => w.name)).toEqual(["Ok"]);
    expect(res.errors[0]).toMatch(/broken\.json/);
  });
});

describe("mergeSyncResult", () => {
  it("keeps edits and deletions made while a sync was running", async () => {
    const repo = new FakeRepo();
    const a = workout("A");
    const b = workout("B");
    const snapshot = state([a, b]);
    const out = await syncWorkouts(repo, snapshot);

    // During the sync: A was edited, B was deleted, C was created.
    const aEdited = { ...a, name: "A2", dirty: true };
    const c = workout("C");
    const merged = mergeSyncResult(state([aEdited, c]), snapshot, out);

    expect(merged.workouts.map((w) => [w.name, w.file, w.dirty])).toEqual([
      ["A2", "a.json", true],
      ["C", undefined, undefined],
    ]);
    // B got a file during the sync, so it must now be deleted remotely.
    expect(merged.deleted).toEqual([{ file: "b.json", sha: repo.files.get("b.json")!.sha }]);
  });
});

describe("uniqueFileName", () => {
  it("avoids existing names case-insensitively", () => {
    expect(uniqueFileName("Hill Climb", new Set(["Hill-Climb.json", "hill-climb-2.json"]))).toBe("hill-climb-3.json");
  });
});

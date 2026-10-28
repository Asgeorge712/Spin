import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ProfileChart } from "./components/ProfileChart";
import { RideMode } from "./components/RideMode";
import { SetList } from "./components/SetList";
import { TodayBar, WeekSchedule } from "./components/Schedule";
import { SyncBadge, SyncPanel } from "./components/SyncPanel";
import { configFileName, parseConfigFile, toConfigFile } from "./configFile";
import { suggestedSchedule, type DayKey, type ScheduleState } from "./schedule";
import { loadDeleted, loadSchedule, loadWorkouts, saveDeleted, saveSchedule, saveWorkouts } from "./storage";
import type { SyncState } from "./sync/sync";
import { useSync } from "./sync/useSync";
import {
  averageResistance,
  createSet,
  createWorkout,
  formatDuration,
  newId,
  normalizeSet,
  rideCopyName,
  totalDuration,
  type SpinSet,
  type Workout,
} from "./workout";

function downloadJson(fileName: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/** A new, unsynced copy of a workout. */
function copyOf(w: Workout, name: string): Workout {
  return {
    ...w,
    id: newId(),
    name,
    sets: w.sets.map((s) => ({ ...s, id: newId() })),
    updatedAt: Date.now(),
    file: undefined,
    sha: undefined,
    dirty: true,
  };
}

export default function App() {
  const [library, setLibrary] = useState<SyncState>(() => ({ workouts: loadWorkouts(), deleted: loadDeleted() }));
  const { workouts } = library;
  const [activeId, setActiveId] = useState<string | null>(() => workouts[0]?.id ?? null);
  const [riding, setRiding] = useState(false);
  // The copy created by changing resistance during the current ride, if any.
  const [rideCopyId, setRideCopyId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => saveWorkouts(library.workouts), [library.workouts]);
  useEffect(() => saveDeleted(library.deleted), [library.deleted]);

  const [schedule, setSchedule] = useState<ScheduleState>(() => loadSchedule(workouts));
  useEffect(() => saveSchedule(schedule), [schedule]);

  // A day set to a workout before it had a file refers to it by id; switch to
  // the file name once sync gives it one, so other devices can find it.
  useEffect(() => {
    const byId = new Map(workouts.filter((w) => w.file).map((w) => [w.id, w.file!]));
    if (!Object.values(schedule.schedule).some((k) => k && byId.has(k))) return;
    setSchedule((s) => ({
      ...s,
      dirty: true,
      schedule: Object.fromEntries(
        Object.entries(s.schedule).map(([d, k]) => [d, (k && byId.get(k)) ?? k]),
      ) as ScheduleState["schedule"],
    }));
  }, [workouts, schedule.schedule]);

  const setDay = (day: DayKey, key: string | null) =>
    setSchedule((s) => ({ ...s, dirty: true, schedule: { ...s.schedule, [day]: key } }));

  const sync = useSync(library, setLibrary, schedule, setSchedule);

  const setWorkouts = useCallback(
    (update: (ws: Workout[]) => Workout[]) => setLibrary((lib) => ({ ...lib, workouts: update(lib.workouts) })),
    [],
  );

  const active: Workout | undefined = workouts.find((w) => w.id === activeId) ?? workouts[0];

  const stats = useMemo(
    () =>
      active && {
        total: totalDuration(active.sets),
        avg: averageResistance(active.sets),
        peak: Math.max(0, ...active.sets.map((s) => s.resistance)),
      },
    [active],
  );

  const addWorkouts = (added: Workout[]) => {
    if (added.length === 0) return;
    setWorkouts((ws) => [...ws, ...added]);
    setActiveId(added[added.length - 1].id);
  };

  const newWorkout = () => addWorkouts([{ ...createWorkout(`Workout ${workouts.length + 1}`), dirty: true }]);

  const importFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    const imported: Workout[] = [];
    const errors: string[] = [];
    for (const file of files) {
      try {
        const w = parseConfigFile(JSON.parse(await file.text()), file.name.replace(/\.json$/i, ""));
        imported.push({ ...w, dirty: true });
      } catch (err) {
        errors.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    addWorkouts(imported);
    if (errors.length > 0) alert(`Some files couldn't be imported:\n\n${errors.join("\n")}`);
  };

  const importButton = (
    <>
      <button type="button" onClick={() => fileInput.current?.click()}>
        ⬆ Import files…
      </button>
      <input ref={fileInput} type="file" accept=".json,application/json" multiple hidden onChange={importFiles} />
    </>
  );

  if (!active || !stats) {
    return (
      <main className="app">
        <header className="app-header">
          <h1>Spin Workout Builder</h1>
          <SyncBadge sync={sync} />
        </header>
        <section className="card empty-library">
          <p>No workouts yet.</p>
          <div className="files-actions">
            <button type="button" className="primary" onClick={newWorkout}>
              + New workout
            </button>
            {importButton}
          </div>
        </section>
        <SyncPanel sync={sync} />
      </main>
    );
  }

  const patchActive = (patch: Partial<Workout>) =>
    setWorkouts((ws) =>
      ws.map((w) => (w.id === active.id ? { ...w, ...patch, updatedAt: Date.now(), dirty: true } : w)),
    );

  const setSets = (sets: SpinSet[]) => patchActive({ sets });

  const addSet = () => {
    const last = active.sets[active.sets.length - 1];
    setSets([...active.sets, createSet(last ? { resistance: last.resistance, durationSec: last.durationSec } : {})]);
  };

  const deleteWorkout = () => {
    if (!confirm(`Delete "${active.name}"?${active.file ? " This also deletes it on your other devices." : ""}`)) return;
    setLibrary((lib) => ({
      workouts: lib.workouts.filter((w) => w.id !== active.id),
      deleted: active.file ? [...lib.deleted, { file: active.file, sha: active.sha }] : lib.deleted,
    }));
    setActiveId(workouts.find((w) => w.id !== active.id)?.id ?? null);
  };

  const rideWorkout = (w: Workout) => {
    setActiveId(w.id);
    setRideCopyId(null);
    setRiding(true);
  };

  const startRide = () => {
    setRideCopyId(null);
    setRiding(true);
  };

  // The first resistance change in a ride saves a new workout with the new
  // numbers and switches the ride over to it; later changes update that copy.
  const changeRideResistance = (setIndex: number, resistance: number) => {
    const sets = active.sets.map((s, i) => (i === setIndex ? normalizeSet({ ...s, resistance }) : s));
    if (rideCopyId === active.id) {
      patchActive({ sets });
      return;
    }
    const copy = { ...copyOf(active, rideCopyName(active.name, new Date())), sets };
    addWorkouts([copy]);
    setRideCopyId(copy.id);
  };

  if (riding && active.sets.length > 0) {
    return (
      <main className="app">
        <RideMode
          workout={active}
          onExit={() => setRiding(false)}
          onResistanceChange={changeRideResistance}
          savedAsNew={rideCopyId === active.id}
        />
      </main>
    );
  }

  return (
    <main className="app">
      <header className="app-header">
        <h1>Spin Workout Builder</h1>
        <SyncBadge sync={sync} />
        <div className="workout-picker">
          <select value={active.id} onChange={(e) => setActiveId(e.target.value)} aria-label="Workout">
            {workouts.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={newWorkout}>
            + New
          </button>
          <button type="button" onClick={() => addWorkouts([copyOf(active, `${active.name} (copy)`)])}>
            Duplicate
          </button>
          <button type="button" className="danger" onClick={deleteWorkout}>
            Delete
          </button>
        </div>
      </header>

      <TodayBar schedule={schedule.schedule} workouts={workouts} onRide={rideWorkout} />

      <section className="card">
        <input
          className="workout-name"
          value={active.name}
          aria-label="Workout name"
          onChange={(e) => patchActive({ name: e.target.value })}
        />
        {active.file && sync.config && <div className="muted file-name">{active.file}</div>}
        <div className="stats">
          <div>
            <span>Total time</span>
            <strong>{formatDuration(stats.total)}</strong>
          </div>
          <div>
            <span>Sets</span>
            <strong>{active.sets.length}</strong>
          </div>
          <div>
            <span>Avg resistance</span>
            <strong>{Math.round(stats.avg)}</strong>
          </div>
          <div>
            <span>Peak</span>
            <strong>{stats.peak}</strong>
          </div>
        </div>
        <ProfileChart sets={active.sets} />
        <button type="button" className="primary ride-button" disabled={active.sets.length === 0} onClick={startRide}>
          ▶ Ride this workout
        </button>
      </section>

      <section className="card">
        <SetList sets={active.sets} onChange={setSets} />
        <button type="button" className="add-set" onClick={addSet}>
          + Add set
        </button>
      </section>

      <WeekSchedule
        schedule={schedule.schedule}
        workouts={workouts}
        onChange={setDay}
        onUseSuggested={() => setSchedule((s) => ({ ...s, dirty: true, schedule: suggestedSchedule(workouts) }))}
      />

      <SyncPanel sync={sync} />

      <section className="card files">
        <div>
          <strong>Workout files</strong>
          <p className="muted">
            Save this workout as a <code>.json</code> config file, or load workout files from your device.
          </p>
        </div>
        <div className="files-actions">
          <button type="button" onClick={() => downloadJson(configFileName(active), toConfigFile(active))}>
            ⬇ Export this workout
          </button>
          {importButton}
        </div>
      </section>
    </main>
  );
}

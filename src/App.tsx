import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ProfileChart } from "./components/ProfileChart";
import { RideMode } from "./components/RideMode";
import { SetList } from "./components/SetList";
import { configFileName, parseConfigFile, toConfigFile } from "./configFile";
import { loadWorkouts, saveWorkouts } from "./storage";
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

function initialWorkouts(): Workout[] {
  const saved = loadWorkouts();
  return saved.length > 0 ? saved : [createWorkout()];
}

function downloadJson(fileName: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [workouts, setWorkouts] = useState<Workout[]>(initialWorkouts);
  const [activeId, setActiveId] = useState(() => workouts[0].id);
  const [riding, setRiding] = useState(false);
  // The copy created by changing resistance during the current ride, if any.
  const [rideCopyId, setRideCopyId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => saveWorkouts(workouts), [workouts]);

  const active = workouts.find((w) => w.id === activeId) ?? workouts[0];

  const stats = useMemo(
    () => ({
      total: totalDuration(active.sets),
      avg: averageResistance(active.sets),
      peak: Math.max(0, ...active.sets.map((s) => s.resistance)),
    }),
    [active.sets],
  );

  const patchActive = (patch: Partial<Workout>) =>
    setWorkouts((ws) => ws.map((w) => (w.id === active.id ? { ...w, ...patch, updatedAt: Date.now() } : w)));

  const setSets = (sets: SpinSet[]) => patchActive({ sets });

  const addSet = () => {
    const last = active.sets[active.sets.length - 1];
    setSets([...active.sets, createSet(last ? { resistance: last.resistance, durationSec: last.durationSec } : {})]);
  };

  const addWorkouts = (added: Workout[]) => {
    if (added.length === 0) return;
    setWorkouts((ws) => [...ws, ...added]);
    setActiveId(added[added.length - 1].id);
  };

  const copyOf = (w: Workout, name: string): Workout => ({
    ...w,
    id: newId(),
    name,
    sets: w.sets.map((s) => ({ ...s, id: newId() })),
    updatedAt: Date.now(),
  });

  const deleteWorkout = () => {
    if (!confirm(`Delete "${active.name}"?`)) return;
    const remaining = workouts.filter((w) => w.id !== active.id);
    const next = remaining.length > 0 ? remaining : [createWorkout()];
    setWorkouts(next);
    setActiveId(next[0].id);
  };

  const importFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    const imported: Workout[] = [];
    const errors: string[] = [];
    for (const file of files) {
      try {
        imported.push(parseConfigFile(JSON.parse(await file.text()), file.name.replace(/\.json$/i, "")));
      } catch (err) {
        errors.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    addWorkouts(imported);
    if (errors.length > 0) alert(`Some files couldn't be imported:\n\n${errors.join("\n")}`);
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
        <div className="workout-picker">
          <select value={active.id} onChange={(e) => setActiveId(e.target.value)} aria-label="Workout">
            {workouts.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => addWorkouts([createWorkout(`Workout ${workouts.length + 1}`)])}>
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

      <section className="card">
        <input
          className="workout-name"
          value={active.name}
          aria-label="Workout name"
          onChange={(e) => patchActive({ name: e.target.value })}
        />
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
          <button type="button" onClick={() => fileInput.current?.click()}>
            ⬆ Import files…
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            multiple
            hidden
            onChange={importFiles}
          />
        </div>
      </section>
    </main>
  );
}

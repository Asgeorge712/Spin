import { useEffect, useMemo, useState } from "react";
import { ProfileChart } from "./components/ProfileChart";
import { RideMode } from "./components/RideMode";
import { SetList } from "./components/SetList";
import { loadWorkouts, saveWorkouts } from "./storage";
import {
  averageResistance,
  createSet,
  createWorkout,
  formatDuration,
  newId,
  presetWorkouts,
  totalDuration,
  type SpinSet,
  type Workout,
} from "./workout";

function initialWorkouts(): Workout[] {
  const saved = loadWorkouts();
  return saved.length > 0 ? saved : presetWorkouts();
}

export default function App() {
  const [workouts, setWorkouts] = useState<Workout[]>(initialWorkouts);
  const [activeId, setActiveId] = useState(() => workouts[0].id);
  const [riding, setRiding] = useState(false);

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

  const addWorkout = () => {
    const w = createWorkout(`Workout ${workouts.length + 1}`);
    setWorkouts((ws) => [...ws, w]);
    setActiveId(w.id);
  };

  const duplicateWorkout = () => {
    const copy: Workout = {
      ...active,
      id: newId(),
      name: `${active.name} (copy)`,
      sets: active.sets.map((s) => ({ ...s, id: newId() })),
      updatedAt: Date.now(),
    };
    setWorkouts((ws) => [...ws, copy]);
    setActiveId(copy.id);
  };

  const deleteWorkout = () => {
    if (!confirm(`Delete "${active.name}"?`)) return;
    const remaining = workouts.filter((w) => w.id !== active.id);
    const next = remaining.length > 0 ? remaining : [createWorkout()];
    setWorkouts(next);
    setActiveId(next[0].id);
  };

  if (riding && active.sets.length > 0) {
    return (
      <main className="app">
        <RideMode workout={active} onExit={() => setRiding(false)} />
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
          <button type="button" onClick={addWorkout}>
            + New
          </button>
          <button type="button" onClick={duplicateWorkout}>
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
            <strong>{stats.avg.toFixed(1)}</strong>
          </div>
          <div>
            <span>Peak</span>
            <strong>{stats.peak}</strong>
          </div>
        </div>
        <ProfileChart sets={active.sets} />
        <button
          type="button"
          className="primary ride-button"
          disabled={active.sets.length === 0}
          onClick={() => setRiding(true)}
        >
          ▶ Ride this workout
        </button>
      </section>

      <section className="card">
        <SetList sets={active.sets} onChange={setSets} />
        <button type="button" className="add-set" onClick={addSet}>
          + Add set
        </button>
      </section>
    </main>
  );
}

import { useEffect, useRef, useState } from "react";
import { MAX_RESISTANCE, formatDuration, rideStateAt, type Workout } from "../workout";
import { resistanceColor } from "./colors";
import { ProfileChart } from "./ProfileChart";

function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    osc.frequency.value = 880;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
    osc.onended = () => ctx.close();
  } catch {
    // Audio is a nice-to-have.
  }
}

export function RideMode({ workout, onExit }: { workout: Workout; onExit: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const lastIndex = useRef(0);
  // performance.now() value corresponding to elapsed = 0 while running.
  const anchor = useRef(0);

  const state = rideStateAt(workout.sets, elapsed);

  const seek = (sec: number) => {
    anchor.current = performance.now() - sec * 1000;
    setElapsed(sec);
  };

  useEffect(() => {
    if (!running) return;
    anchor.current = performance.now() - elapsed * 1000;
    const id = setInterval(() => setElapsed(Math.floor((performance.now() - anchor.current) / 1000)), 250);
    return () => clearInterval(id);
    // Only restart the ticker on play/pause; seeks move the anchor directly.
  }, [running]);

  useEffect(() => {
    if (!state) return;
    if (state.done) {
      setRunning(false);
      beep();
    } else if (state.index !== lastIndex.current) {
      beep();
    }
    lastIndex.current = state.index;
  }, [state?.index, state?.done]);

  if (!state) return null;
  const { set, next } = state;

  const skip = (delta: number) => {
    let start = 0;
    const target = Math.min(Math.max(state.index + delta, 0), workout.sets.length);
    for (let i = 0; i < target; i++) start += workout.sets[i].durationSec;
    seek(start);
  };

  return (
    <div className="ride">
      <header className="ride-header">
        <button type="button" onClick={onExit}>
          ← Back to editor
        </button>
        <h2>{workout.name}</h2>
        <span className="muted">{formatDuration(state.remainingTotal)} left</span>
      </header>

      {state.done ? (
        <div className="ride-done">
          <h3>Workout complete 🎉</h3>
          <button type="button" className="primary" onClick={() => seek(0)}>
            Ride again
          </button>
        </div>
      ) : (
        <div className="ride-current" style={{ borderColor: resistanceColor(set.resistance) }}>
          <div className="ride-label">
            Set {state.index + 1} of {workout.sets.length} · {set.label}
          </div>
          <div className="ride-timer">{formatDuration(state.remainingInSet)}</div>
          <div className="ride-stats">
            <div>
              <span>Resistance</span>
              <strong style={{ color: resistanceColor(set.resistance) }}>
                {set.resistance}
                <small>/{MAX_RESISTANCE}</small>
              </strong>
            </div>
            <div>
              <span>Position</span>
              <strong>{set.position === "standing" ? "Stand" : "Seated"}</strong>
            </div>
            <div>
              <span>Cadence</span>
              <strong>{set.cadence ? `${set.cadence}` : "—"}</strong>
            </div>
          </div>
          {next && (
            <div className="ride-next">
              Next: {next.label} · {formatDuration(next.durationSec)} @ {next.resistance}
            </div>
          )}
        </div>
      )}

      <ProfileChart sets={workout.sets} elapsedSec={elapsed} height={90} />

      <div className="ride-controls">
        <button type="button" onClick={() => skip(-1)}>
          ⏮ Prev
        </button>
        <button type="button" className="primary" disabled={state.done} onClick={() => setRunning((r) => !r)}>
          {running ? "Pause" : elapsed === 0 ? "Start" : "Resume"}
        </button>
        <button type="button" onClick={() => skip(1)}>
          Next ⏭
        </button>
      </div>
    </div>
  );
}

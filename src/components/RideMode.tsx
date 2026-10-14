import { useEffect, useRef, useState, type PointerEvent } from "react";
import { MAX_RESISTANCE, MIN_RESISTANCE, clamp, formatDuration, rideStateAt, type Workout } from "../workout";
import { resistanceColor } from "./colors";
import { ProfileChart } from "./ProfileChart";

/** Pixels of vertical finger movement per resistance point. */
const PX_PER_POINT = 3;

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

const isTouchScreen = () =>
  typeof window !== "undefined" && (matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0);

/** Keeps the screen awake while `active`, where the browser supports it. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = () => {
      navigator.wakeLock
        .request("screen")
        .then((l) => {
          if (cancelled) void l.release();
          else lock = l;
        })
        .catch(() => {});
    };
    // The lock is dropped when the tab is hidden; take it again on return.
    const onVisible = () => document.visibilityState === "visible" && acquire();
    acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, [active]);
}

interface Props {
  workout: Workout;
  onExit: () => void;
  /** Called when the rider drags a set's resistance to a new value. */
  onResistanceChange: (setIndex: number, resistance: number) => void;
  /** Set once mid-ride changes have been saved as a new workout. */
  savedAsNew: boolean;
}

export function RideMode({ workout, onExit, onResistanceChange, savedAsNew }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const lastIndex = useRef(0);
  // performance.now() value corresponding to elapsed = 0 while running.
  const anchor = useRef(0);
  const drag = useRef<{ pointerId: number; startY: number; startValue: number; value: number; setIndex: number } | null>(null);
  const [dragValue, setDragValue] = useState<number | null>(null);
  const [touch] = useState(isTouchScreen);

  useWakeLock(running);

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

  // Touch drag on the current-set card: up raises resistance, down lowers it.
  // The value is committed on release, against the set the drag started on.
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" || drag.current) return;
    drag.current = { pointerId: e.pointerId, startY: e.clientY, startValue: set.resistance, value: set.resistance, setIndex: state.index };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const delta = Math.round((d.startY - e.clientY) / PX_PER_POINT);
    d.value = clamp(d.startValue + delta, MIN_RESISTANCE, MAX_RESISTANCE);
    setDragValue(d.value);
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>, commit: boolean) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    if (commit && d.value !== d.startValue) onResistanceChange(d.setIndex, d.value);
    drag.current = null;
    setDragValue(null);
  };

  const shownResistance = dragValue ?? set.resistance;
  const dragging = dragValue !== null;

  return (
    <div className="ride">
      <header className="ride-header">
        <button type="button" onClick={onExit}>
          ← Back to editor
        </button>
        <h2>{workout.name}</h2>
        <span className="muted">{formatDuration(state.remainingTotal)} left</span>
      </header>

      {savedAsNew && <div className="ride-notice">Your changes are being saved as this new workout.</div>}

      {state.done ? (
        <div className="ride-done">
          <h3>Workout complete 🎉</h3>
          <button type="button" className="primary" onClick={() => seek(0)}>
            Ride again
          </button>
        </div>
      ) : (
        <div
          className={`ride-current${dragging ? " dragging" : ""}`}
          style={{ borderColor: resistanceColor(shownResistance) }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => endDrag(e, true)}
          onPointerCancel={(e) => endDrag(e, false)}
        >
          <div className="ride-label">
            Set {state.index + 1} of {workout.sets.length} · {set.label}
          </div>
          <div className="ride-timer">{formatDuration(state.remainingInSet)}</div>
          <div className="ride-stats">
            <div className="ride-resistance">
              <span>Resistance</span>
              <strong style={{ color: resistanceColor(shownResistance) }}>
                {shownResistance}
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
          {touch && <div className="ride-hint">Drag up or down to change resistance</div>}
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

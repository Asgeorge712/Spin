import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  MAX_RESISTANCE,
  MIN_RESISTANCE,
  clamp,
  formatDuration,
  rideStateAt,
  totalDuration,
  type Workout,
} from "../workout";
import { resistanceColor } from "./colors";
import { ProfileChart } from "./ProfileChart";
import { finishChime, intervalBeep, unlockAudio, warningBeep } from "./sound";

/** Pixels of vertical finger movement per resistance point. */
const PX_PER_POINT = 3;
/** Seconds before an interval ends to show the "change resistance" countdown. */
const COUNTDOWN_SEC = 5;
/** Seconds before an interval ends to start the warning beeps. */
const BEEP_SEC = 3;

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
  // The last "set:second" a warning beep played for, so a re-render doesn't repeat it.
  const lastBeep = useRef("");
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
      finishChime();
    } else if (state.index !== lastIndex.current && running) {
      intervalBeep();
    }
    lastIndex.current = state.index;
  }, [state?.index, state?.done]);

  // Warning beeps in the last seconds of each interval.
  useEffect(() => {
    if (!running || !state || state.done || state.remainingInSet > BEEP_SEC) return;
    const key = `${state.index}:${state.remainingInSet}`;
    if (key === lastBeep.current) return;
    lastBeep.current = key;
    warningBeep();
  }, [running, state?.index, state?.remainingInSet]);

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
  const countdown = !state.done && state.remainingInSet <= COUNTDOWN_SEC;
  const countdownText = !next
    ? "Last interval: almost done"
    : next.resistance !== set.resistance
      ? `Change resistance to ${next.resistance}`
      : `Next: ${next.label}`;

  const toggleRunning = () => {
    // Taps are the only time iOS allows audio to be switched on.
    unlockAudio();
    setRunning((r) => !r);
  };

  return (
    <div className="ride">
      <header className="ride-header">
        <h2>{workout.name}</h2>
      </header>

      {savedAsNew && <div className="ride-notice">Your changes are being saved as this new workout.</div>}

      {state.done ? (
        <div className="ride-done">
          <h3>Workout complete 🎉</h3>
        </div>
      ) : (
        <div
          className={`ride-current${dragging ? " dragging" : ""}${countdown ? " counting-down" : ""}`}
          style={{ borderColor: resistanceColor(shownResistance) }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => endDrag(e, true)}
          onPointerCancel={(e) => endDrag(e, false)}
        >
          <div className="ride-label">
            Set {state.index + 1} of {workout.sets.length} · {set.label} · Current Interval Time:{" "}
            {formatDuration(set.durationSec)}
          </div>
          <div className="ride-clock">
            <div className="ride-total ride-elapsed">
              <span>Total Elapsed Time</span>
              <strong>{formatDuration(totalDuration(workout.sets) - state.remainingTotal)}</strong>
            </div>
            {countdown ? (
              <div className="ride-countdown" role="status">
                <div
                  className="ride-countdown-text"
                  style={next ? { color: resistanceColor(next.resistance) } : undefined}
                >
                  {countdownText}
                </div>
                <div className="ride-timer">{state.remainingInSet}</div>
              </div>
            ) : (
              <div className="ride-timer">{formatDuration(state.remainingInSet)}</div>
            )}
            <div className="ride-total ride-remaining">
              <span>Total Time Remaining</span>
              <strong>{formatDuration(state.remainingTotal)}</strong>
            </div>
          </div>
          <div className="ride-stats">
            <div>
              <span>Position</span>
              <strong>{set.position === "standing" ? "Stand" : "Seated"}</strong>
            </div>
            <div className="ride-resistance">
              <span>Resistance</span>
              <strong style={{ color: resistanceColor(shownResistance) }}>
                {shownResistance}
                <small>/{MAX_RESISTANCE}</small>
              </strong>
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
        <div className="ride-main-control">
          {!state.done && (
            <button type="button" className="primary" onClick={toggleRunning}>
              {running ? "Pause" : elapsed === 0 ? "Start" : "Resume"}
            </button>
          )}
          {!running && (
            <button type="button" className="ride-exit" onClick={onExit}>
              ← Back to editor
            </button>
          )}
        </div>
        <button type="button" onClick={() => skip(1)}>
          Next ⏭
        </button>
      </div>
    </div>
  );
}

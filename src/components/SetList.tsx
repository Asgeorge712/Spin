import { useEffect, useState } from "react";
import {
  MAX_RESISTANCE,
  MIN_RESISTANCE,
  formatDuration,
  newId,
  normalizeSet,
  parseDuration,
  type Position,
  type SpinSet,
} from "../workout";
import { resistanceColor } from "./colors";

function DurationInput({ value, onChange }: { value: number; onChange: (sec: number) => void }) {
  const [text, setText] = useState(formatDuration(value));
  useEffect(() => setText(formatDuration(value)), [value]);

  const commit = () => {
    const parsed = parseDuration(text);
    if (parsed === null) setText(formatDuration(value));
    else onChange(parsed);
  };

  return (
    <input
      className="duration-input"
      value={text}
      inputMode="numeric"
      aria-label="Length (m:ss)"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
    />
  );
}

interface Props {
  sets: SpinSet[];
  onChange: (sets: SpinSet[]) => void;
}

export function SetList({ sets, onChange }: Props) {
  const update = (index: number, patch: Partial<SpinSet>) => {
    onChange(sets.map((s, i) => (i === index ? normalizeSet({ ...s, ...patch }) : s)));
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= sets.length) return;
    const next = [...sets];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const duplicate = (index: number) => {
    const copy = { ...sets[index], id: newId() };
    onChange([...sets.slice(0, index + 1), copy, ...sets.slice(index + 1)]);
  };

  const remove = (index: number) => onChange(sets.filter((_, i) => i !== index));

  if (sets.length === 0) {
    return <p className="empty">No sets yet. Add one to get started.</p>;
  }

  return (
    <ol className="set-list">
      {sets.map((set, i) => (
        <li key={set.id} className="set-row" style={{ borderLeftColor: resistanceColor(set.resistance) }}>
          <span className="set-num">{i + 1}</span>

          <label className="field field-label">
            <span>Name</span>
            <input value={set.label} onChange={(e) => update(i, { label: e.target.value })} />
          </label>

          <label className="field field-duration">
            <span>Length</span>
            <DurationInput value={set.durationSec} onChange={(durationSec) => update(i, { durationSec })} />
          </label>

          <label className="field field-resistance">
            <span>
              Resistance <strong>{set.resistance}</strong>/{MAX_RESISTANCE}
            </span>
            <input
              type="range"
              min={MIN_RESISTANCE}
              max={MAX_RESISTANCE}
              value={set.resistance}
              style={{ accentColor: resistanceColor(set.resistance) }}
              onChange={(e) => update(i, { resistance: Number(e.target.value) })}
            />
          </label>

          <label className="field field-position">
            <span>Position</span>
            <select value={set.position} onChange={(e) => update(i, { position: e.target.value as Position })}>
              <option value="seated">Seated</option>
              <option value="standing">Standing</option>
            </select>
          </label>

          <label className="field field-cadence">
            <span>RPM</span>
            <input
              type="number"
              min={30}
              max={140}
              placeholder="—"
              value={set.cadence ?? ""}
              onChange={(e) => update(i, { cadence: e.target.value === "" ? undefined : Number(e.target.value) })}
            />
          </label>

          <div className="row-actions">
            <button type="button" title="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
              ↑
            </button>
            <button type="button" title="Move down" onClick={() => move(i, 1)} disabled={i === sets.length - 1}>
              ↓
            </button>
            <button type="button" title="Duplicate" onClick={() => duplicate(i)}>
              ⧉
            </button>
            <button type="button" title="Delete" className="danger" onClick={() => remove(i)}>
              ✕
            </button>
          </div>
        </li>
      ))}
    </ol>
  );
}

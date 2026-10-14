import { MAX_RESISTANCE, formatDuration, totalDuration, type SpinSet } from "../workout";
import { resistanceColor } from "./colors";

interface Props {
  sets: SpinSet[];
  /** Seconds elapsed; draws a progress marker when provided. */
  elapsedSec?: number;
  height?: number;
}

const WIDTH = 1000;

/** Bar chart of the workout: bar width is set length, bar height is resistance. */
export function ProfileChart({ sets, elapsedSec, height = 140 }: Props) {
  const total = totalDuration(sets);
  if (total === 0) return null;

  let x = 0;
  return (
    <svg
      className="profile-chart"
      viewBox={`0 0 ${WIDTH} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Workout profile, ${sets.length} sets, ${formatDuration(total)}`}
    >
      {sets.map((s) => {
        const w = (s.durationSec / total) * WIDTH;
        const h = (s.resistance / MAX_RESISTANCE) * (height - 4);
        const rect = (
          <rect
            key={s.id}
            x={x + 0.5}
            y={height - h}
            width={Math.max(w - 1, 0.5)}
            height={h}
            rx={2}
            fill={resistanceColor(s.resistance)}
          >
            <title>{`${s.label}: ${formatDuration(s.durationSec)} @ ${s.resistance}`}</title>
          </rect>
        );
        x += w;
        return rect;
      })}
      {elapsedSec !== undefined && (
        <>
          <rect x={0} y={0} width={(elapsedSec / total) * WIDTH} height={height} className="chart-elapsed" />
          <line
            x1={(elapsedSec / total) * WIDTH}
            x2={(elapsedSec / total) * WIDTH}
            y1={0}
            y2={height}
            className="chart-cursor"
          />
        </>
      )}
    </svg>
  );
}

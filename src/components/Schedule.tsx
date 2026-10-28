import { DAYS, DAY_NAMES, findScheduled, todayKey, workoutKey, type DayKey, type Schedule } from "../schedule";
import { formatDuration, totalDuration, type Workout } from "../workout";
import { resistanceColor } from "./colors";

const peak = (w: Workout) => Math.max(0, ...w.sets.map((s) => s.resistance));

/** Today's planned ride, with a button to start it. */
export function TodayBar({
  schedule,
  workouts,
  onRide,
}: {
  schedule: Schedule;
  workouts: Workout[];
  onRide: (w: Workout) => void;
}) {
  const day = todayKey();
  const key = schedule[day];
  const workout = findScheduled(workouts, key);

  return (
    <section className="card today">
      <div className="today-text">
        <span className="today-day">Today · {DAY_NAMES[day]}</span>
        {workout ? (
          <strong>
            {workout.name} <span className="muted">· {formatDuration(totalDuration(workout.sets))}</span>
          </strong>
        ) : key ? (
          <strong>Planned ride not found on this device</strong>
        ) : (
          <strong>Rest day 😌</strong>
        )}
      </div>
      {workout && (
        <button type="button" className="primary" onClick={() => onRide(workout)}>
          ▶ Ride
        </button>
      )}
      <a href="#schedule" className="today-edit">
        Edit week
      </a>
    </section>
  );
}

/** Pick a workout (or rest) for each day of the week. */
export function WeekSchedule({
  schedule,
  workouts,
  onChange,
  onUseSuggested,
}: {
  schedule: Schedule;
  workouts: Workout[];
  onChange: (day: DayKey, key: string | null) => void;
  onUseSuggested: () => void;
}) {
  const today = todayKey();
  const sorted = [...workouts].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section className="card week" id="schedule">
      <strong>This week</strong>
      <p className="muted">Pick a ride for each day. Today's ride shows at the top of the app.</p>
      <ul className="week-days">
        {DAYS.map((day) => {
          const key = schedule[day];
          const workout = findScheduled(workouts, key);
          const missing = key !== null && !workout;
          return (
            <li key={day} className={day === today ? "is-today" : undefined}>
              <span className="week-day">
                {DAY_NAMES[day]}
                {day === today && <span className="week-today-tag">Today</span>}
              </span>
              <select
                aria-label={`${DAY_NAMES[day]} ride`}
                value={workout ? workoutKey(workout) : missing ? (key ?? "") : ""}
                onChange={(e) => onChange(day, e.target.value || null)}
              >
                <option value="">Rest</option>
                {missing && <option value={key ?? ""}>(missing ride)</option>}
                {sorted.map((w) => (
                  <option key={w.id} value={workoutKey(w)}>
                    {w.name}
                  </option>
                ))}
              </select>
              <span className="week-meta">
                {workout && (
                  <>
                    {formatDuration(totalDuration(workout.sets))}
                    <span className="week-peak" style={{ background: resistanceColor(peak(workout)) }} title="Peak resistance">
                      {peak(workout)}
                    </span>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <button type="button" className="week-suggest" onClick={onUseSuggested}>
        Use the suggested week
      </button>
    </section>
  );
}

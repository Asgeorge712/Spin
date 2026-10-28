import { useState } from "react";
import { DAYS, DAY_NAMES, findScheduled, todayKey, workoutKey, type DayKey, type Schedule } from "../schedule";
import { formatDuration, totalDuration, type Workout } from "../workout";
import { resistanceColor } from "./colors";
import { ProfileChart } from "./ProfileChart";

const peak = (w: Workout) => Math.max(0, ...w.sets.map((s) => s.resistance));

/** The app's home screen: today's ride, a button to start it, and the next few days. */
export function TodayView({
  schedule,
  workouts,
  onRide,
  onOpenWeek,
}: {
  schedule: Schedule;
  workouts: Workout[];
  onRide: (w: Workout) => void;
  onOpenWeek: () => void;
}) {
  const now = new Date();
  const day = todayKey(now);
  const key = schedule[day];
  const workout = findScheduled(workouts, key);
  const sorted = [...workouts].sort((a, b) => a.name.localeCompare(b.name));
  const [pick, setPick] = useState("");
  const picked = workouts.find((w) => w.id === pick) ?? sorted[0];
  const upcoming = [1, 2, 3].map((n) => DAYS[(DAYS.indexOf(day) + n) % 7]);

  return (
    <>
      <section className="card today">
        <div className="today-date">
          {now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </div>
        {workout ? (
          <>
            <h2 className="today-name">{workout.name}</h2>
            <div className="today-meta">
              {formatDuration(totalDuration(workout.sets))} · {workout.sets.length} sets · peak{" "}
              <span className="week-peak" style={{ background: resistanceColor(peak(workout)) }}>
                {peak(workout)}
              </span>
            </div>
            <ProfileChart sets={workout.sets} height={110} />
            <button type="button" className="primary today-start" onClick={() => onRide(workout)}>
              ▶ Start ride
            </button>
          </>
        ) : (
          <>
            <h2 className="today-name">{key ? "Today's ride isn't on this device" : "Rest day 😌"}</h2>
            {sorted.length > 0 && (
              <div className="today-anyway">
                <span className="muted">{key ? "Pick something else:" : "Feel like riding anyway?"}</span>
                <select aria-label="Ride to start" value={picked?.id} onChange={(e) => setPick(e.target.value)}>
                  {sorted.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} · {formatDuration(totalDuration(w.sets))}
                    </option>
                  ))}
                </select>
                <button type="button" className="primary" onClick={() => picked && onRide(picked)}>
                  ▶ Ride
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <section className="card coming-up">
        <strong>Coming up</strong>
        <ul>
          {upcoming.map((d, i) => {
            const w = findScheduled(workouts, schedule[d]);
            return (
              <li key={d}>
                <span className="week-day">{i === 0 ? "Tomorrow" : DAY_NAMES[d]}</span>
                <span className="coming-ride">{w ? w.name : schedule[d] ? "(missing ride)" : "Rest"}</span>
                <span className="week-meta">
                  {w && (
                    <>
                      {formatDuration(totalDuration(w.sets))}
                      <span className="week-peak" style={{ background: resistanceColor(peak(w)) }}>
                        {peak(w)}
                      </span>
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        <button type="button" className="link-button" onClick={onOpenWeek}>
          See the whole week →
        </button>
      </section>
    </>
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
      <p className="muted">Pick a ride for each day. Today's ride is on the Today tab.</p>
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

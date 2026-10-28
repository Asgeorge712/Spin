import { SCHEDULE_FILE, parseSchedule, serializeSchedule, type ScheduleState } from "../schedule";
import type { WorkoutRepo } from "./github";

/**
 * Syncs the weekly schedule file. It's one small file that people rarely edit
 * on two devices at once, so the rule is simple: a local change is sent (and
 * replaces whatever is there), otherwise a remote change is taken.
 */
export async function syncSchedule(repo: WorkoutRepo, local: ScheduleState): Promise<ScheduleState> {
  const remote = (await repo.list()).find((f) => f.name === SCHEDULE_FILE);
  if (local.dirty) {
    const sha = await repo.write(SCHEDULE_FILE, serializeSchedule(local.schedule), remote?.sha, "Update weekly schedule");
    return { ...local, sha, dirty: false };
  }
  if (remote && remote.sha !== local.sha) {
    return { schedule: parseSchedule(JSON.parse(await repo.read(remote))), sha: remote.sha, dirty: false };
  }
  return local;
}

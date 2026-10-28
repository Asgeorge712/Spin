import { useCallback, useEffect, useRef, useState } from "react";
import { isLibraryRepo } from "../library";
import { SCHEDULE_FOLDER, type ScheduleState } from "../schedule";
import { loadSyncConfig, saveSyncConfig } from "../storage";
import { GitHubWorkoutRepo, SyncError, type SyncConfig } from "./github";
import { syncSchedule } from "./scheduleSync";
import { hasPendingChanges, mergeSyncResult, syncWorkouts, type SyncState } from "./sync";

/** Wait after the last edit before syncing, so typing doesn't make a commit per keystroke. */
const EDIT_DEBOUNCE_MS = 4000;
/** How often to check for changes made on other devices. */
const POLL_MS = 2 * 60 * 1000;

export type SyncStatus =
  | { state: "off" }
  | { state: "syncing" }
  | { state: "synced"; at: number; warnings: string[] }
  | { state: "offline" }
  | { state: "error"; message: string };

export interface SyncControls {
  config: SyncConfig | null;
  status: SyncStatus;
  pending: boolean;
  /** Checks the config works, saves it on this device, and syncs. */
  connect(config: SyncConfig): Promise<void>;
  disconnect(): void;
  syncNow(): void;
  /** Conflict copies made by the last sync, for the user to review. */
  conflicts: string[];
}

export function useSync(
  state: SyncState,
  setState: (update: (s: SyncState) => SyncState) => void,
  schedule: ScheduleState,
  setSchedule: (update: (s: ScheduleState) => ScheduleState) => void,
): SyncControls {
  const [config, setConfig] = useState<SyncConfig | null>(loadSyncConfig);
  const [status, setStatus] = useState<SyncStatus>(() => (config ? { state: "synced", at: 0, warnings: [] } : { state: "off" }));
  const [conflicts, setConflicts] = useState<string[]>([]);

  const latest = useRef(state);
  latest.current = state;
  const latestSchedule = useRef(schedule);
  latestSchedule.current = schedule;
  const running = useRef(false);
  const again = useRef(false);
  // The state a sync last produced, so that applying it doesn't trigger another sync.
  const fromSync = useRef<SyncState | null>(null);
  // Starts as the loaded schedule, so only a real edit to it counts as one.
  const scheduleFromSync = useRef<ScheduleState | null>(schedule);
  // Bumped when a sync finishes. A sync only counts as done once its result has
  // been rendered, so the next one never starts from a stale snapshot.
  const [finished, setFinished] = useState(0);

  const run = useCallback(
    async (cfg: SyncConfig | null) => {
      if (!cfg) return;
      if (running.current) {
        again.current = true;
        return;
      }
      running.current = true;
      setStatus({ state: "syncing" });
      try {
        const snapshot = latest.current;
        const outcome = await syncWorkouts(new GitHubWorkoutRepo(cfg), snapshot, new Date(), {
          // Syncing to your own repo: library rides you have here belong in it too.
          uploadUnsynced: !isLibraryRepo(cfg.owner, cfg.repo),
        });
        setState((current) => {
          const merged = mergeSyncResult(current, snapshot, outcome);
          // Edits made during the sync still need sending, so only mark the
          // result as sync-made if there weren't any.
          fromSync.current = current === snapshot ? merged : null;
          return merged;
        });
        if (outcome.conflicts.length > 0) setConflicts((c) => [...c, ...outcome.conflicts]);
        if (outcome.stopped?.kind === "offline") setStatus({ state: "offline" });
        else if (outcome.stopped) setStatus({ state: "error", message: outcome.stopped.message });
        else {
          const warnings = [...outcome.errors];
          try {
            const scheduleSnapshot = latestSchedule.current;
            const synced = await syncSchedule(new GitHubWorkoutRepo({ ...cfg, folder: SCHEDULE_FOLDER }), scheduleSnapshot);
            setSchedule((current) => {
              // Changed during the sync: keep the change (still marked to send) with the new SHA.
              const merged = current === scheduleSnapshot ? synced : { ...current, sha: synced.sha };
              scheduleFromSync.current = current === scheduleSnapshot ? merged : null;
              return merged;
            });
          } catch (err) {
            warnings.push(`Weekly schedule: ${err instanceof Error ? err.message : String(err)}`);
          }
          setStatus({ state: "synced", at: Date.now(), warnings });
        }
      } catch (err) {
        if (err instanceof SyncError && err.kind === "offline") setStatus({ state: "offline" });
        else setStatus({ state: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        setFinished((n) => n + 1);
      }
    },
    [setState, setSchedule],
  );

  // Runs after the sync's result has rendered (so `latest` is up to date).
  useEffect(() => {
    if (finished === 0) return;
    running.current = false;
    if (again.current) {
      again.current = false;
      void run(config);
    }
    // Only when a sync finishes, using the config at that time.
  }, [finished]);

  const syncNow = useCallback(() => void run(config), [run, config]);

  // On start, when the connection comes back, when the app returns to the foreground, and periodically.
  useEffect(() => {
    if (!config) return;
    void run(config);
    const onVisible = () => document.visibilityState === "visible" && void run(config);
    const onOnline = () => void run(config);
    const poll = setInterval(() => document.visibilityState === "visible" && void run(config), POLL_MS);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(poll);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [config, run]);

  // Shortly after local edits. A sync's own result doesn't count, so if things
  // are still pending after a sync (offline, refused, a bad file), the retry
  // waits for the next edit, the connection coming back, or the periodic check.
  const pending = hasPendingChanges(state) || schedule.dirty === true;
  useEffect(() => {
    if (!config || !pending) return;
    if (state === fromSync.current && schedule === scheduleFromSync.current) return;
    const t = setTimeout(() => void run(config), EDIT_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [config, pending, state, schedule, run]);

  const connect = useCallback(async (cfg: SyncConfig) => {
    await new GitHubWorkoutRepo(cfg).verify();
    saveSyncConfig(cfg);
    setConflicts([]);
    setConfig(cfg);
  }, []);

  const disconnect = useCallback(() => {
    saveSyncConfig(null);
    setConfig(null);
    setStatus({ state: "off" });
  }, []);

  return { config, status, pending, connect, disconnect, syncNow, conflicts };
}

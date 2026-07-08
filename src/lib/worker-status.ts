import type { WorkerRun } from "@prisma/client";

export type RunnerType = "github-actions" | "local" | "vps" | "railway" | "unknown";
export const BACKFILL_WORKER_NAME = "perpl-echo-backfill";
export const STALE_RUNNING_WORKER_MINUTES = 45;

export function runnerTypeFromWorkerName(workerName: string | null | undefined): RunnerType {
  const name = (workerName ?? "").toLowerCase();
  if (name.includes("github")) return "github-actions";
  if (name.includes("local")) return "local";
  if (name.includes("railway")) return "railway";
  if (name.includes("vps") || name === "perpl-echo-worker") return "vps";
  return "unknown";
}

export function withRunnerType<T extends Pick<WorkerRun, "workerName"> | null>(run: T) {
  if (!run) return null;
  return {
    ...run,
    runnerType: runnerTypeFromWorkerName(run.workerName)
  };
}

export function isBackfillWorker(workerName: string | null | undefined) {
  return workerName === BACKFILL_WORKER_NAME;
}

export function effectiveWorkerStatus(run: Pick<WorkerRun, "status" | "startedAt" | "finishedAt"> | null) {
  if (!run) return null;
  if (run.status === "running" && !run.finishedAt) {
    const ageMinutes = Math.max(0, (Date.now() - run.startedAt.getTime()) / 60_000);
    if (ageMinutes > STALE_RUNNING_WORKER_MINUTES) return "timed_out";
  }
  return run.status;
}

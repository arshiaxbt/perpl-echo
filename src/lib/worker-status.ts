import type { WorkerRun } from "@prisma/client";

export type RunnerType = "github-actions" | "local" | "vps" | "railway" | "unknown";

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

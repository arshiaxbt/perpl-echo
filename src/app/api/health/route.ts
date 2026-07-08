import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { snapshotFreshnessStatus } from "@/lib/data-quality";
import { getOnchainStatus } from "@/lib/onchain";
import { BACKFILL_WORKER_NAME, runnerTypeFromWorkerName, withRunnerType } from "@/lib/worker-status";

export async function GET() {
  let databaseConnected = false;
  let latestSnapshotTimestamp: Date | null = null;
  let latestOnchainProcessedBlock: string | null = null;
  let databaseLatencyMs: number | null = null;
  let message: string | null = null;
  const started = Date.now();

  try {
    const [latestSnapshot, latestCursor, lastSuccessfulWorkerRun, lastSuccessfulCollectorRun, onchain] = await Promise.all([
      prisma.marketSnapshot.findFirst({
        orderBy: { timestamp: "desc" },
        select: { timestamp: true }
      }),
      prisma.onchainBlockCursor.findFirst({
        orderBy: { updatedAt: "desc" },
        select: { lastProcessedBlock: true }
      }),
      prisma.workerRun.findFirst({
        where: { status: "success", workerName: { not: BACKFILL_WORKER_NAME } },
        orderBy: { startedAt: "desc" }
      }),
      prisma.collectorRun.findFirst({ where: { status: "success" }, orderBy: { startedAt: "desc" } }),
      getOnchainStatus()
    ]);
    databaseConnected = true;
    databaseLatencyMs = Date.now() - started;
    latestSnapshotTimestamp = latestSnapshot?.timestamp ?? null;
    latestOnchainProcessedBlock = latestCursor?.lastProcessedBlock.toString() ?? null;
    const freshness = snapshotFreshnessStatus(latestSnapshotTimestamp);
    const workerAgeMinutes = lastSuccessfulWorkerRun?.finishedAt
      ? Math.max(0, (Date.now() - lastSuccessfulWorkerRun.finishedAt.getTime()) / 60_000)
      : null;
    const warnings = [
      freshness.reason,
      lastSuccessfulWorkerRun ? null : "No successful worker run recorded.",
      workerAgeMinutes !== null && workerAgeMinutes > 15
        ? "No successful worker run in the last 15 minutes."
        : null,
      lastSuccessfulCollectorRun ? null : "No successful collector run recorded."
    ].filter((warning): warning is string => Boolean(warning));

    return NextResponse.json(
      {
        ok: databaseConnected && !freshness.stale,
        appVersion: process.env.npm_package_version ?? null,
        databaseConnected,
        databaseLatencyMs,
        latestSnapshotTimestamp,
        snapshotFreshness: freshness,
        latestOnchainProcessedBlock,
        onchain,
        lastSuccessfulWorkerRun: withRunnerType(lastSuccessfulWorkerRun),
        lastSuccessfulCollectorRun,
        runnerType: runnerTypeFromWorkerName(lastSuccessfulWorkerRun?.workerName),
        workerFreshness: {
          ageMinutes: workerAgeMinutes,
          stale: workerAgeMinutes === null || workerAgeMinutes > 15
        },
        warnings,
        message
      },
      { status: databaseConnected ? 200 : 503 }
    );
  } catch (error) {
    message = error instanceof Error ? error.message : "Database health check failed";
  }

  return NextResponse.json(
    {
      ok: databaseConnected,
      appVersion: process.env.npm_package_version ?? null,
      databaseConnected,
      databaseLatencyMs,
      latestSnapshotTimestamp,
      latestOnchainProcessedBlock,
      message
    },
    { status: databaseConnected ? 200 : 503 }
  );
}

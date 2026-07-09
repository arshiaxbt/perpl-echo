import { env } from "@/lib/env";
import { jsonSafe } from "@/lib/json";
import { prisma } from "@/lib/prisma";
import { ensureAllClusters, ensureLatestClusters } from "@/lib/cluster-service";
import { classifyMissingRegimes } from "@/lib/regime";
import { hasSuccessfulBackfillRun, recordBackfillRun, runRetentionMaintenance } from "@/lib/retention";
import { STALE_RUNNING_WORKER_MINUTES } from "@/lib/worker-status";
import { collectSnapshotsOnce } from "./collector";
import { runOnchainIndexerOnce } from "./onchain-indexer";
import { backfillHistoricalCandles } from "./backfill";

type WorkerCycleStats = {
  collector?: Awaited<ReturnType<typeof collectSnapshotsOnce>> & { skipped?: boolean };
  onchain?: Awaited<ReturnType<typeof runOnchainIndexerOnce>>;
  regimesClassified: number;
  clustersUpdated: number;
  transitionsUpdated: number;
  retention?: Awaited<ReturnType<typeof runRetentionMaintenance>>;
  durationMs: number;
};

const once = process.argv.includes("--once");
let shuttingDown = false;

type WorkerCycleOptions = {
  runCollector: boolean;
  runDerived: boolean;
  runOnchain: boolean;
};

function requireDatabaseUrl() {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for the worker target.");
  }
}

async function runDerivedJobs() {
  let regimesClassified = 0;
  let clusters = { clusters: 0, transitions: 0 };

  if (env.WORKER_DERIVED_MODE === "full") {
    const markets = await prisma.market.findMany({ where: { active: true }, select: { id: true } });
    for (const market of markets) {
      regimesClassified += await classifyMissingRegimes(market.id);
    }
    clusters = await ensureAllClusters();
  } else {
    clusters = await ensureLatestClusters();
  }

  const retention = env.RETENTION_ENABLED
    ? await runRetentionMaintenance({
        rawSnapshotDays: env.RAW_SNAPSHOT_RETENTION_DAYS,
        rawOnchainEventDays: env.RAW_ONCHAIN_EVENT_RETENTION_DAYS
      })
    : undefined;
  return {
    regimesClassified,
    clustersUpdated: clusters.clusters,
    transitionsUpdated: clusters.transitions,
    retention
  };
}

async function runWorkerCycle(options: WorkerCycleOptions) {
  const started = Date.now();
  await markStaleRunningWorkerRuns();
  const run = await prisma.workerRun.create({
    data: {
      workerName: env.WORKER_NAME,
      status: "running"
    }
  });

  try {
    const stats: WorkerCycleStats = {
      regimesClassified: 0,
      clustersUpdated: 0,
      transitionsUpdated: 0,
      durationMs: 0
    };

    if (options.runCollector && env.SNAPSHOT_COLLECTOR_ENABLED) {
      try {
        stats.collector = await collectSnapshotsOnce();
        console.log(`[collector] success saved=${stats.collector.snapshotsSaved} markets=${stats.collector.marketsChecked}`);
      } catch (error) {
        console.error("[collector] fail", error);
        throw error;
      }
    } else {
      stats.collector = { snapshotsSaved: 0, marketsChecked: 0, skipped: true };
      console.log(`[collector] skipped ${env.SNAPSHOT_COLLECTOR_ENABLED ? "not_due" : "disabled"}`);
    }

    if (options.runOnchain) {
      try {
        stats.onchain = await runOnchainIndexerOnce();
        console.log(`[onchain] latestBlock=${stats.onchain.latestBlock ?? "n/a"} saved=${stats.onchain.eventsSaved} skipped=${stats.onchain.skipped}`);
      } catch (error) {
        console.error("[onchain] fail", error);
        throw error;
      }
    } else {
      stats.onchain = { eventsSaved: 0, latestBlock: null, skipped: true };
    }

    if (options.runDerived) {
      const derived = await runDerivedJobs();
      stats.regimesClassified = derived.regimesClassified;
      stats.clustersUpdated = derived.clustersUpdated;
      stats.transitionsUpdated = derived.transitionsUpdated;
      stats.retention = derived.retention;
    }
    stats.durationMs = Date.now() - started;

    console.log(
      `[derived] snapshotsClassified=${stats.regimesClassified} clusters=${stats.clustersUpdated} transitions=${stats.transitionsUpdated}`
    );
    if (stats.retention) {
      console.log(
        `[retention] aggregatedHours=${stats.retention.aggregatedHours} deletedSnapshots=${stats.retention.deletedSnapshots} deletedOnchainEvents=${stats.retention.deletedOnchainEvents}`
      );
    }
    console.log(`[worker] cycle durationMs=${stats.durationMs}`);

    await prisma.workerRun.update({
      where: { id: run.id },
      data: {
        status: "success",
        finishedAt: new Date(),
        message: "worker cycle completed",
        statsJson: jsonSafe(stats)
      }
    });

    return stats;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown worker error";
    const durationMs = Date.now() - started;
    console.error(`[worker] cycle failed durationMs=${durationMs}`, error);
    await prisma.workerRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        message,
        statsJson: jsonSafe({ durationMs })
      }
    });
    throw error;
  }
}

async function markStaleRunningWorkerRuns() {
  const cutoff = new Date(Date.now() - STALE_RUNNING_WORKER_MINUTES * 60_000);
  await prisma.workerRun.updateMany({
    where: {
      workerName: env.WORKER_NAME,
      status: "running",
      startedAt: { lt: cutoff },
      finishedAt: null
    },
    data: {
      status: "failed",
      finishedAt: new Date(),
      message: "Marked failed because the previous run exceeded the worker timeout."
    }
  });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  requireDatabaseUrl();

  if (!env.WORKER_ENABLED) {
    console.log("[worker] WORKER_ENABLED=false; exiting");
    return;
  }

  console.log(`[worker] started mode=${once ? "once" : "loop"} collectorIntervalMs=${env.COLLECTOR_INTERVAL_MS} onchainPollIntervalMs=${env.ONCHAIN_POLL_INTERVAL_MS}`);

  if (env.BACKFILL_ON_START) {
    const snapshotCount = await prisma.marketSnapshot.count();
    const alreadyBackfilled = await hasSuccessfulBackfillRun();
    if (!env.BACKFILL_FORCE && alreadyBackfilled) {
      console.log("[backfill] skipped previous successful backfill exists");
    } else if (snapshotCount < env.BACKFILL_MIN_SNAPSHOTS || env.BACKFILL_FORCE) {
      console.log(`[backfill] starting days=${env.BACKFILL_DAYS} currentSnapshots=${snapshotCount}`);
      const startedAt = new Date();
      try {
        await backfillHistoricalCandles(env.BACKFILL_DAYS, env.BACKFILL_SYMBOL);
        await recordBackfillRun({
          status: "success",
          startedAt,
          message: "startup candle backfill completed",
          statsJson: jsonSafe({ days: env.BACKFILL_DAYS, symbol: env.BACKFILL_SYMBOL || null, snapshotCountBefore: snapshotCount })
        });
        console.log("[backfill] completed");
      } catch (error) {
        await recordBackfillRun({
          status: "failed",
          startedAt,
          message: error instanceof Error ? error.message : "startup candle backfill failed",
          statsJson: jsonSafe({ days: env.BACKFILL_DAYS, snapshotCountBefore: snapshotCount })
        });
        console.error("[backfill] failed; continuing worker startup", error);
      }
    } else {
      console.log(`[backfill] skipped currentSnapshots=${snapshotCount} min=${env.BACKFILL_MIN_SNAPSHOTS}`);
    }
  }

  if (once) {
    await runWorkerCycle({ runCollector: true, runDerived: true, runOnchain: env.ONCHAIN_INDEXER_ENABLED });
    return;
  }

  let lastCollectorRunAt = 0;
  let lastOnchainRunAt = 0;
  const onchainRunnable = env.ONCHAIN_INDEXER_ENABLED && Boolean(env.MONAD_RPC_URL && env.PERPL_CONTRACT_ADDRESSES);
  const loopIntervalMs = onchainRunnable
    ? Math.min(env.COLLECTOR_INTERVAL_MS, env.ONCHAIN_POLL_INTERVAL_MS)
    : env.COLLECTOR_INTERVAL_MS;

  while (!shuttingDown) {
    try {
      const now = Date.now();
      const collectorDue = now - lastCollectorRunAt >= env.COLLECTOR_INTERVAL_MS;
      const onchainDue = onchainRunnable && now - lastOnchainRunAt >= env.ONCHAIN_POLL_INTERVAL_MS;
      if (collectorDue) lastCollectorRunAt = now;
      if (onchainDue) lastOnchainRunAt = now;
      if (!collectorDue && !onchainDue) {
        const nextCollectorIn = env.COLLECTOR_INTERVAL_MS - (now - lastCollectorRunAt);
        const nextOnchainIn = onchainRunnable ? env.ONCHAIN_POLL_INTERVAL_MS - (now - lastOnchainRunAt) : loopIntervalMs;
        await delay(Math.max(1000, Math.min(loopIntervalMs, nextCollectorIn, nextOnchainIn)));
        continue;
      }
      await runWorkerCycle({ runCollector: collectorDue, runDerived: collectorDue, runOnchain: onchainDue });
    } catch {
      // Error details are logged and persisted by runWorkerCycle. Keep the worker alive.
    }
    if (!shuttingDown) {
      const afterCycle = Date.now();
      const nextCollectorIn = env.COLLECTOR_INTERVAL_MS - (afterCycle - lastCollectorRunAt);
      const nextOnchainIn = onchainRunnable ? env.ONCHAIN_POLL_INTERVAL_MS - (afterCycle - lastOnchainRunAt) : loopIntervalMs;
      await delay(Math.max(1000, Math.min(loopIntervalMs, nextCollectorIn, nextOnchainIn)));
    }
  }
}

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] received ${signal}; shutting down`);
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

main()
  .catch(async (error) => {
    console.error("[worker] fatal", error);
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(async () => {
    if (once) await prisma.$disconnect();
  });

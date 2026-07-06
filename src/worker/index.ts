import { env } from "@/lib/env";
import { jsonSafe } from "@/lib/json";
import { prisma } from "@/lib/prisma";
import { ensureAllClusters } from "@/lib/cluster-service";
import { classifyMissingRegimes } from "@/lib/regime";
import { collectSnapshotsOnce } from "./collector";
import { runOnchainIndexerOnce } from "./onchain-indexer";

type WorkerCycleStats = {
  collector?: Awaited<ReturnType<typeof collectSnapshotsOnce>> & { skipped?: boolean };
  onchain?: Awaited<ReturnType<typeof runOnchainIndexerOnce>>;
  regimesClassified: number;
  clustersUpdated: number;
  transitionsUpdated: number;
  durationMs: number;
};

const once = process.argv.includes("--once");
let shuttingDown = false;

type WorkerCycleOptions = {
  runCollector: boolean;
  runDerived: boolean;
};

function requireDatabaseUrl() {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for the worker target.");
  }
}

async function runDerivedJobs() {
  const markets = await prisma.market.findMany({ where: { active: true }, select: { id: true } });
  let regimesClassified = 0;
  for (const market of markets) {
    regimesClassified += await classifyMissingRegimes(market.id);
  }

  const clusters = await ensureAllClusters();
  return {
    regimesClassified,
    clustersUpdated: clusters.clusters,
    transitionsUpdated: clusters.transitions
  };
}

async function runWorkerCycle(options: WorkerCycleOptions) {
  const started = Date.now();
  const run = await prisma.workerRun.create({
    data: {
      workerName: "perpl-echo-worker",
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

    try {
      stats.onchain = await runOnchainIndexerOnce();
      console.log(`[onchain] latestBlock=${stats.onchain.latestBlock ?? "n/a"} saved=${stats.onchain.eventsSaved} skipped=${stats.onchain.skipped}`);
    } catch (error) {
      console.error("[onchain] fail", error);
      throw error;
    }

    if (options.runDerived) {
      const derived = await runDerivedJobs();
      stats.regimesClassified = derived.regimesClassified;
      stats.clustersUpdated = derived.clustersUpdated;
      stats.transitionsUpdated = derived.transitionsUpdated;
    }
    stats.durationMs = Date.now() - started;

    console.log(`[derived] snapshotsClassified=${stats.regimesClassified} clusters=${stats.clustersUpdated} transitions=${stats.transitionsUpdated}`);
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

  if (once) {
    await runWorkerCycle({ runCollector: true, runDerived: true });
    return;
  }

  let lastCollectorRunAt = 0;
  const loopIntervalMs = Math.min(env.COLLECTOR_INTERVAL_MS, env.ONCHAIN_POLL_INTERVAL_MS);

  while (!shuttingDown) {
    try {
      const now = Date.now();
      const collectorDue = now - lastCollectorRunAt >= env.COLLECTOR_INTERVAL_MS;
      await runWorkerCycle({ runCollector: collectorDue, runDerived: collectorDue });
      if (collectorDue) lastCollectorRunAt = now;
    } catch {
      // Error details are logged and persisted by runWorkerCycle. Keep the worker alive.
    }
    if (!shuttingDown) {
      await delay(loopIntervalMs);
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

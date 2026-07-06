import { NextResponse } from "next/server";
import { snapshotFreshnessStatus } from "@/lib/data-quality";
import { jsonSafePublic } from "@/lib/json";
import { getOnchainStatus } from "@/lib/onchain";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const [
    latestWorkerRun,
    lastSuccessfulWorkerRun,
    latestCollectorRun,
    lastSuccessfulCollectorRun,
    latestIndexerCursor,
    latestSnapshot,
    snapshotCounts,
    onchainSnapshotCounts,
    clusterCounts,
    transitionCounts,
    onchain
  ] = await Promise.all([
    prisma.workerRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.workerRun.findFirst({ where: { status: "success" }, orderBy: { startedAt: "desc" } }),
    prisma.collectorRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.collectorRun.findFirst({ where: { status: "success" }, orderBy: { startedAt: "desc" } }),
    prisma.onchainBlockCursor.findFirst({ orderBy: { updatedAt: "desc" } }),
    prisma.marketSnapshot.findFirst({ orderBy: { timestamp: "desc" }, select: { timestamp: true } }),
    prisma.marketSnapshot.count(),
    prisma.onchainIntelligenceSnapshot.count(),
    prisma.marketStateCluster.count(),
    prisma.marketStateTransition.count(),
    getOnchainStatus()
  ]);

  const stats = latestWorkerRun?.statsJson as
    | {
        regimesClassified?: number;
        clustersUpdated?: number;
        transitionsUpdated?: number;
        onchain?: { latestBlock?: string | null };
      }
    | null
    | undefined;

  return NextResponse.json(
    jsonSafePublic({
      latestWorkerRun,
      lastSuccessfulWorkerRun,
      latestCollectorRun,
      lastSuccessfulCollectorRun,
      latestIndexerBlock: latestIndexerCursor?.lastProcessedBlock ?? stats?.onchain?.latestBlock ?? null,
      snapshotFreshness: snapshotFreshnessStatus(latestSnapshot?.timestamp ?? null),
      onchain,
      latestDerivedJobRun: latestWorkerRun
        ? {
            startedAt: latestWorkerRun.startedAt,
            finishedAt: latestWorkerRun.finishedAt,
            status: latestWorkerRun.status,
            regimesClassified: stats?.regimesClassified ?? null,
            clustersUpdated: stats?.clustersUpdated ?? null,
            transitionsUpdated: stats?.transitionsUpdated ?? null
          }
        : null,
      counts: {
        marketSnapshots: snapshotCounts,
        onchainIntelligenceSnapshots: onchainSnapshotCounts,
        clusters: clusterCounts,
        transitions: transitionCounts
      }
    })
  );
}

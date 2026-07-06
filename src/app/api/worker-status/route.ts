import { NextResponse } from "next/server";
import { jsonSafePublic } from "@/lib/json";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const [
    latestWorkerRun,
    latestCollectorRun,
    latestIndexerCursor,
    snapshotCounts,
    onchainSnapshotCounts,
    clusterCounts,
    transitionCounts
  ] = await Promise.all([
    prisma.workerRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.collectorRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.onchainBlockCursor.findFirst({ orderBy: { updatedAt: "desc" } }),
    prisma.marketSnapshot.count(),
    prisma.onchainIntelligenceSnapshot.count(),
    prisma.marketStateCluster.count(),
    prisma.marketStateTransition.count()
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
      latestCollectorRun,
      latestIndexerBlock: latestIndexerCursor?.lastProcessedBlock ?? stats?.onchain?.latestBlock ?? null,
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

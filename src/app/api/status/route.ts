import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOnchainStatus } from "@/lib/onchain";

export async function GET() {
  const [snapshots, latest, marketsTracked, lastRun, onchain, onchainIntelligenceSnapshots] = await Promise.all([
    prisma.marketSnapshot.count(),
    prisma.marketSnapshot.findFirst({ orderBy: { timestamp: "desc" } }),
    prisma.market.count({ where: { active: true } }),
    prisma.collectorRun.findFirst({ orderBy: { startedAt: "desc" } }),
    getOnchainStatus(),
    prisma.onchainIntelligenceSnapshot.count()
  ]);

  return NextResponse.json({
    snapshots,
    latestSnapshotTime: latest?.timestamp ?? null,
    marketsTracked,
    collectorStatus: lastRun?.status ?? "not_started",
    collectorMessage: lastRun?.message ?? null,
    lastRun,
    onchain,
    onchainIntelligenceSnapshots
  });
}

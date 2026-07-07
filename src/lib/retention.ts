import type { MarketSnapshot } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export const RETENTION_DEFAULTS = {
  rawSnapshotDays: 30,
  rawOnchainEventDays: 7,
  maxAggregationRows: 5000
};

export async function runRetentionMaintenance({
  rawSnapshotDays = RETENTION_DEFAULTS.rawSnapshotDays,
  rawOnchainEventDays = RETENTION_DEFAULTS.rawOnchainEventDays
}: {
  rawSnapshotDays?: number;
  rawOnchainEventDays?: number;
} = {}) {
  const snapshotCutoff = new Date(Date.now() - rawSnapshotDays * 24 * 60 * 60 * 1000);
  const onchainCutoff = new Date(Date.now() - rawOnchainEventDays * 24 * 60 * 60 * 1000);

  const aggregatedHours = await aggregateOldSnapshots(snapshotCutoff);
  const deletedSnapshots = await pruneAggregatedSnapshots(snapshotCutoff);
  const deletedOnchainEvents = await prisma.onchainEvent.deleteMany({
    where: { createdAt: { lt: onchainCutoff } }
  });

  return {
    aggregatedHours,
    deletedSnapshots: deletedSnapshots.count,
    deletedOnchainEvents: deletedOnchainEvents.count
  };
}

export async function hasSuccessfulBackfillRun() {
  const run = await prisma.workerRun.findFirst({
    where: { workerName: "perpl-echo-backfill", status: "success" },
    orderBy: { startedAt: "desc" },
    select: { id: true }
  });
  return Boolean(run);
}

export async function recordBackfillRun({
  status,
  startedAt,
  message,
  statsJson
}: {
  status: "success" | "failed";
  startedAt: Date;
  message?: string | null;
  statsJson?: Prisma.InputJsonValue;
}) {
  await prisma.workerRun.create({
    data: {
      workerName: "perpl-echo-backfill",
      startedAt,
      finishedAt: new Date(),
      status,
      message,
      statsJson
    }
  });
}

async function aggregateOldSnapshots(cutoff: Date) {
  const rows = await prisma.marketSnapshot.findMany({
    where: { timestamp: { lt: cutoff } },
    orderBy: [{ marketId: "asc" }, { timestamp: "asc" }],
    take: RETENTION_DEFAULTS.maxAggregationRows
  });
  const groups = groupSnapshotsByHour(rows);
  let saved = 0;

  for (const [key, snapshots] of groups) {
    const [marketIdText, hourIso] = key.split(":");
    const marketId = Number(marketIdText);
    const timestamp = new Date(hourIso);
    const summary = summarizeHour(snapshots);
    if (!summary) continue;

    await prisma.marketHourlySnapshot.upsert({
      where: { marketId_timestamp: { marketId, timestamp } },
      update: summary,
      create: {
        marketId,
        timestamp,
        ...summary
      }
    });
    saved += 1;
  }

  return saved;
}

async function pruneAggregatedSnapshots(cutoff: Date) {
  const summaries = await prisma.marketHourlySnapshot.findMany({
    where: { timestamp: { lt: cutoff } },
    select: { marketId: true, timestamp: true },
    take: RETENTION_DEFAULTS.maxAggregationRows
  });
  if (!summaries.length) return { count: 0 };

  let deleted = 0;
  for (const summary of summaries) {
    const from = summary.timestamp;
    const to = new Date(from.getTime() + 60 * 60 * 1000);
    const upper = new Date(Math.min(to.getTime(), cutoff.getTime()));
    const result = await prisma.marketSnapshot.deleteMany({
      where: {
        marketId: summary.marketId,
        timestamp: { gte: from, lt: upper }
      }
    });
    deleted += result.count;
  }

  return { count: deleted };
}

function groupSnapshotsByHour(snapshots: MarketSnapshot[]) {
  const groups = new Map<string, MarketSnapshot[]>();
  for (const snapshot of snapshots) {
    const hour = floorToHour(snapshot.timestamp);
    const key = `${snapshot.marketId}:${hour.toISOString()}`;
    groups.set(key, [...(groups.get(key) ?? []), snapshot]);
  }
  return groups;
}

function summarizeHour(snapshots: MarketSnapshot[]) {
  if (!snapshots.length) return null;
  const sorted = [...snapshots].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const prices = sorted.map((snapshot) => snapshot.price);
  const regimeCounts: Record<string, number> = {};
  for (const snapshot of sorted) {
    if (!snapshot.regime) continue;
    regimeCounts[snapshot.regime] = (regimeCounts[snapshot.regime] ?? 0) + 1;
  }

  return {
    openPrice: sorted[0].price,
    highPrice: Math.max(...prices),
    lowPrice: Math.min(...prices),
    closePrice: sorted[sorted.length - 1].price,
    averagePrice: avg(sorted.map((snapshot) => snapshot.price)) ?? sorted[sorted.length - 1].price,
    averageFundingRate: avg(sorted.map((snapshot) => snapshot.fundingRate)) ?? 0,
    averageFundingApr: avg(sorted.map((snapshot) => snapshot.fundingApr)) ?? 0,
    totalVolume: sorted.reduce((sum, snapshot) => sum + snapshot.volume, 0),
    averageOpenInterest: avg(sorted.map((snapshot) => snapshot.openInterest)),
    averageSpread: avg(sorted.map((snapshot) => snapshot.spread)),
    averageVolatility: avg(sorted.map((snapshot) => snapshot.volatility)) ?? 0,
    sampleCount: sorted.length,
    regimeCountsJson: regimeCounts
  };
}

function floorToHour(date: Date) {
  const hour = new Date(date);
  hour.setUTCMinutes(0, 0, 0);
  return hour;
}

function avg(values: Array<number | null>) {
  const sample = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return sample.length ? sample.reduce((sum, value) => sum + value, 0) / sample.length : null;
}

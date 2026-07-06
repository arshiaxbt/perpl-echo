import type { MarketSnapshot, MarketStateCluster } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { fundingPercentile } from "./metrics";
import { classifySnapshot } from "./regime";
import { clamp } from "./utils";

type SnapshotWithCluster = MarketSnapshot & { cluster?: MarketStateCluster | null };

export function clusterFingerprint(snapshot: MarketSnapshot, fundingRates: number[]) {
  const regime = snapshot.regime ?? "SIDEWAYS";
  const fundingPct = fundingPercentile(snapshot.fundingRate, fundingRates) ?? 50;
  const fundingBucket = fundingPct >= 95 ? "funding_extreme_positive" : fundingPct <= 5 ? "funding_extreme_negative" : fundingPct >= 75 ? "funding_high" : fundingPct <= 25 ? "funding_low" : "funding_mid";
  const volatilityBucket = snapshot.volatility >= 6 ? "vol_high" : snapshot.volatility >= 3 ? "vol_mid" : "vol_low";
  const momentumBucket =
    snapshot.trendScore >= 1.5 ? "momentum_up" : snapshot.trendScore <= -1.5 ? "momentum_down" : Math.abs(snapshot.return24hBefore) < 1.2 ? "momentum_flat" : "momentum_mixed";
  const liquidityBucket = snapshot.volumeChange <= -50 || (snapshot.spread ?? 0) > 0.1 ? "thin" : snapshot.volumeChange >= 100 ? "active" : "normal";

  return {
    regime,
    fundingBucket,
    volatilityBucket,
    momentumBucket,
    liquidityBucket,
    keyPart: [regime, fundingBucket, volatilityBucket, momentumBucket, liquidityBucket].join(":")
  };
}

export function clusterNameFromFingerprint(fingerprint: ReturnType<typeof clusterFingerprint>) {
  if (fingerprint.regime === "FUNDING_EXTREME_POSITIVE" && fingerprint.volatilityBucket !== "vol_low") return "Extreme Positive Funding Expansion";
  if (fingerprint.regime === "FUNDING_EXTREME_NEGATIVE") return "Extreme Negative Funding Flush";
  if (fingerprint.regime === "PANIC") return "Panic Flush";
  if (fingerprint.regime === "SQUEEZE") return "Squeeze Setup";
  if (fingerprint.regime === "VOLATILITY_EXPANSION") return "Volatility Breakout";
  if (fingerprint.regime === "CALM") return "Calm Accumulation";
  if (fingerprint.momentumBucket === "momentum_up" && fingerprint.fundingBucket.includes("high")) return "Crowded Longs";
  if (fingerprint.momentumBucket === "momentum_down" && fingerprint.fundingBucket.includes("low")) return "Crowded Shorts";
  if (fingerprint.liquidityBucket === "thin") return "Low Liquidity Chop";
  if (fingerprint.momentumBucket === "momentum_up" || fingerprint.momentumBucket === "momentum_down") return "Trend Continuation";
  if (fingerprint.fundingBucket.includes("extreme")) return "Exhaustion";
  return "Calm Accumulation";
}

export async function ensureClustersForMarket(marketId: number) {
  const snapshots = await prisma.marketSnapshot.findMany({
    where: { marketId },
    orderBy: { timestamp: "asc" },
    take: 20000
  });
  if (!snapshots.length) return { clusters: 0, transitions: 0 };

  const classified = classifySnapshots(snapshots);
  const fundingRates = classified.map((snapshot) => snapshot.fundingRate);
  const byKey = new Map<string, MarketSnapshot[]>();
  for (const snapshot of classified) {
    const fingerprint = clusterFingerprint(snapshot, fundingRates);
    const clusterKey = `${marketId}:${fingerprint.keyPart}`;
    byKey.set(clusterKey, [...(byKey.get(clusterKey) ?? []), snapshot]);
  }

  const clusterByKey = new Map<string, MarketStateCluster>();
  for (const [clusterKey, rows] of byKey) {
    const fingerprint = clusterFingerprint(rows[0], fundingRates);
    const outcomes = rows.map((snapshot) => futureOutcome(snapshot, classified));
    const cluster = await prisma.marketStateCluster.upsert({
      where: { clusterKey },
      update: {
        name: clusterNameFromFingerprint(fingerprint),
        description: describeCluster(fingerprint),
        regime: fingerprint.regime,
        sampleSize: rows.length,
        averageDurationMinutes: averageDuration(rows),
        averageReturn1h: avg(outcomes.map((outcome) => outcome?.return1h ?? null)),
        averageReturn4h: avg(outcomes.map((outcome) => outcome?.return4h ?? null)),
        averageReturn24h: avg(outcomes.map((outcome) => outcome?.return24h ?? null)),
        fundingNormalizationRate: percentTrue(outcomes.map((outcome) => outcome?.fundingNormalized ?? null)),
        centroidJson: centroid(rows)
      },
      create: {
        marketId,
        clusterKey,
        name: clusterNameFromFingerprint(fingerprint),
        description: describeCluster(fingerprint),
        regime: fingerprint.regime,
        sampleSize: rows.length,
        averageDurationMinutes: averageDuration(rows),
        averageReturn1h: avg(outcomes.map((outcome) => outcome?.return1h ?? null)),
        averageReturn4h: avg(outcomes.map((outcome) => outcome?.return4h ?? null)),
        averageReturn24h: avg(outcomes.map((outcome) => outcome?.return24h ?? null)),
        fundingNormalizationRate: percentTrue(outcomes.map((outcome) => outcome?.fundingNormalized ?? null)),
        transitionJson: {},
        centroidJson: centroid(rows)
      }
    });
    clusterByKey.set(clusterKey, cluster);
  }

  for (const snapshot of classified) {
    const fingerprint = clusterFingerprint(snapshot, fundingRates);
    const cluster = clusterByKey.get(`${marketId}:${fingerprint.keyPart}`);
    if (cluster && snapshot.clusterId !== cluster.id) {
      await prisma.marketSnapshot.update({ where: { id: snapshot.id }, data: { clusterId: cluster.id } });
    }
  }

  const transitions = await updateTransitions(marketId);
  return { clusters: clusterByKey.size, transitions };
}

export async function ensureAllClusters() {
  const markets = await prisma.market.findMany({ where: { active: true }, select: { id: true } });
  let clusters = 0;
  let transitions = 0;
  for (const market of markets) {
    const result = await ensureClustersForMarket(market.id);
    clusters += result.clusters;
    transitions += result.transitions;
  }
  return { clusters, transitions };
}

export async function currentClusterForMarket(symbol: string) {
  const market = await prisma.market.findUnique({ where: { symbol: symbol.toUpperCase() } });
  if (!market) return null;
  await ensureClustersForMarket(market.id);
  const latest = await prisma.marketSnapshot.findFirst({
    where: { marketId: market.id },
    orderBy: { timestamp: "desc" },
    include: { cluster: true }
  });
  return latest ? { market, snapshot: latest, cluster: latest.cluster } : null;
}

export async function clustersForMarket(symbol: string) {
  const market = await prisma.market.findUnique({ where: { symbol: symbol.toUpperCase() } });
  if (!market) return null;
  await ensureClustersForMarket(market.id);
  const clusters = await prisma.marketStateCluster.findMany({
    where: { marketId: market.id },
    orderBy: [{ sampleSize: "desc" }, { name: "asc" }]
  });
  return { market, clusters };
}

export async function allClusters() {
  return prisma.marketStateCluster.findMany({ orderBy: [{ sampleSize: "desc" }, { name: "asc" }], take: 200 });
}

export async function stateGraphForMarket(symbol: string) {
  const current = await currentClusterForMarket(symbol);
  if (!current) return null;
  const clusters = await prisma.marketStateCluster.findMany({ where: { marketId: current.market.id }, orderBy: { sampleSize: "desc" } });
  const transitions = await prisma.marketStateTransition.findMany({ where: { marketId: current.market.id }, include: { fromCluster: true, toCluster: true } });
  return {
    market: current.market,
    currentNodeId: current.cluster?.id ?? null,
    nodes: clusters.map((cluster) => ({
      id: cluster.id,
      name: cluster.name,
      regime: cluster.regime,
      sampleSize: cluster.sampleSize,
      averageReturn4h: cluster.averageReturn4h,
      isCurrent: cluster.id === current.cluster?.id
    })),
    edges: transitions.map((transition) => ({
      source: transition.fromClusterId,
      target: transition.toClusterId,
      probability: transition.probability,
      transitionCount: transition.transitionCount,
      averageMinutesToTransition: transition.averageMinutesToTransition,
      averageReturnDuringTransition: transition.averageReturnDuringTransition
    }))
  };
}

export async function currentEvolutionForMarket(symbol: string) {
  const current = await currentClusterForMarket(symbol);
  if (!current?.cluster) return current ? { ...current, transitions: [] } : null;
  const transitions = await prisma.marketStateTransition.findMany({
    where: { marketId: current.market.id, fromClusterId: current.cluster.id },
    include: { toCluster: true },
    orderBy: { probability: "desc" },
    take: 8
  });
  return { ...current, transitions };
}

async function updateTransitions(marketId: number) {
  const snapshots = await prisma.marketSnapshot.findMany({
    where: { marketId, clusterId: { not: null } },
    orderBy: { timestamp: "asc" }
  });
  const transitions = new Map<string, Array<{ from: SnapshotWithCluster; to: SnapshotWithCluster }>>();
  for (let index = 1; index < snapshots.length; index += 1) {
    const from = snapshots[index - 1] as SnapshotWithCluster;
    const to = snapshots[index] as SnapshotWithCluster;
    if (!from.clusterId || !to.clusterId || from.clusterId === to.clusterId) continue;
    const key = `${from.clusterId}:${to.clusterId}`;
    transitions.set(key, [...(transitions.get(key) ?? []), { from, to }]);
  }
  const totals = new Map<string, number>();
  for (const [key, rows] of transitions) {
    const fromClusterId = key.split(":")[0];
    totals.set(fromClusterId, (totals.get(fromClusterId) ?? 0) + rows.length);
  }
  let saved = 0;
  for (const [key, rows] of transitions) {
    const [fromClusterId, toClusterId] = key.split(":");
    const total = totals.get(fromClusterId) || rows.length;
    await prisma.marketStateTransition.upsert({
      where: { marketId_fromClusterId_toClusterId: { marketId, fromClusterId, toClusterId } },
      update: {
        transitionCount: rows.length,
        probability: rows.length / total,
        averageMinutesToTransition: avg(rows.map((row) => (row.to.timestamp.getTime() - row.from.timestamp.getTime()) / 60000)),
        averageReturnDuringTransition: avg(rows.map((row) => pctChange(row.to.price, row.from.price)))
      },
      create: {
        marketId,
        fromClusterId,
        toClusterId,
        transitionCount: rows.length,
        probability: rows.length / total,
        averageMinutesToTransition: avg(rows.map((row) => (row.to.timestamp.getTime() - row.from.timestamp.getTime()) / 60000)),
        averageReturnDuringTransition: avg(rows.map((row) => pctChange(row.to.price, row.from.price)))
      }
    });
    saved += 1;
  }
  return saved;
}

function classifySnapshots(snapshots: MarketSnapshot[]) {
  const classified: MarketSnapshot[] = [];
  for (const snapshot of snapshots) {
    if (snapshot.regime) {
      classified.push(snapshot);
      continue;
    }
    const classification = classifySnapshot(snapshot, classified);
    classified.push({ ...snapshot, regime: classification.regime, regimeConfidence: classification.confidence, regimeReasonsJson: classification.reasons });
  }
  return classified;
}

function describeCluster(fingerprint: ReturnType<typeof clusterFingerprint>) {
  return `${fingerprint.regime.replaceAll("_", " ")} with ${fingerprint.fundingBucket.replaceAll("_", " ")}, ${fingerprint.volatilityBucket.replaceAll("_", " ")}, and ${fingerprint.momentumBucket.replaceAll("_", " ")}.`;
}

function centroid(rows: MarketSnapshot[]): Prisma.InputJsonObject {
  return {
    price: avg(rows.map((row) => row.price)),
    fundingRate: avg(rows.map((row) => row.fundingRate)),
    fundingApr: avg(rows.map((row) => row.fundingApr)),
    volatility: avg(rows.map((row) => row.volatility)),
    volumeChange: avg(rows.map((row) => row.volumeChange)),
    trendScore: avg(rows.map((row) => row.trendScore)),
    return24hBefore: avg(rows.map((row) => row.return24hBefore))
  };
}

function averageDuration(rows: MarketSnapshot[]) {
  if (rows.length < 2) return null;
  const sorted = [...rows].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const gaps = sorted.slice(1).map((row, index) => clamp((row.timestamp.getTime() - sorted[index].timestamp.getTime()) / 60000, 0, 1440));
  return avg(gaps);
}

export function futureOutcome(snapshot: MarketSnapshot, marketSnapshots: MarketSnapshot[]) {
  const after = marketSnapshots.filter((item) => item.timestamp > snapshot.timestamp);
  const oneHour = nearestAfter(after, snapshot.timestamp.getTime() + 60 * 60 * 1000);
  const fourHour = nearestAfter(after, snapshot.timestamp.getTime() + 4 * 60 * 60 * 1000);
  const day = nearestAfter(after, snapshot.timestamp.getTime() + 24 * 60 * 60 * 1000);
  const window8h = after.filter((item) => item.timestamp.getTime() <= snapshot.timestamp.getTime() + 8 * 60 * 60 * 1000);
  const fundingNormalized = window8h.length ? window8h.some((item) => Math.abs(item.fundingRate) <= Math.abs(snapshot.fundingRate) * 0.5) : null;
  return {
    return1h: oneHour ? pctChange(oneHour.price, snapshot.price) : null,
    return4h: fourHour ? pctChange(fourHour.price, snapshot.price) : null,
    return24h: day ? pctChange(day.price, snapshot.price) : null,
    fundingNormalized
  };
}

function nearestAfter(snapshots: MarketSnapshot[], targetMs: number) {
  return snapshots
    .filter((snapshot) => Math.abs(snapshot.timestamp.getTime() - targetMs) <= 15 * 60 * 1000)
    .sort((a, b) => Math.abs(a.timestamp.getTime() - targetMs) - Math.abs(b.timestamp.getTime() - targetMs))[0];
}

function avg(values: Array<number | null>) {
  const sample = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return sample.length ? sample.reduce((sum, value) => sum + value, 0) / sample.length : null;
}

function percentTrue(values: Array<boolean | null>) {
  const sample = values.filter((value): value is boolean => typeof value === "boolean");
  return sample.length ? (sample.filter(Boolean).length / sample.length) * 100 : null;
}

function pctChange(current: number, previous: number) {
  return previous > 0 ? ((current - previous) / previous) * 100 : 0;
}

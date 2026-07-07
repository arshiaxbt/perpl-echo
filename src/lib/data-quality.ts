import type { MarketSnapshot, OnchainIntelligenceSnapshot } from "@prisma/client";

export const DATA_QUALITY_THRESHOLDS = {
  snapshotIntervalMinutes: 5,
  rarityHistoryHours: 24,
  confidenceSnapshots: 100,
  regimeMatches: 30,
  outcomeMatches: 10,
  staleSnapshotMinutes: 10,
  healthySnapshotMinutes: 10
};

export type ReadinessStatus = "ready" | "limited" | "hidden";
export type OnchainOperationalState = "disabled" | "not_configured" | "offline" | "syncing" | "healthy";

export type DataQualityReport = {
  historyCoverage: {
    status: ReadinessStatus;
    historyHours: number;
    requiredHours: number;
    firstSnapshotAt: Date | null;
    latestSnapshotAt: Date | null;
    reason: string | null;
  };
  snapshotCoverage: {
    status: ReadinessStatus;
    snapshots: number;
    expectedSnapshots: number;
    coveragePercent: number;
    reason: string | null;
  };
  regimeCoverage: {
    status: ReadinessStatus;
    sameRegimeSnapshots: number;
    requiredSnapshots: number;
    reason: string | null;
  };
  featureCompleteness: {
    status: ReadinessStatus;
    score: number;
    availableFeatures: number;
    totalFeatures: number;
    missingFeatures: string[];
    reason: string | null;
  };
  onchainCoverage: {
    status: ReadinessStatus;
    state: OnchainOperationalState;
    reason: string | null;
  };
  analysisReadiness: {
    status: ReadinessStatus;
    score: number;
    reasons: string[];
    hiddenMetrics: {
      rarity: boolean;
      confidence: boolean;
      regimeStatistics: boolean;
      averageOutcome: boolean;
      clusterOutcomes: boolean;
      marketMemory: boolean;
    };
  };
};

export function buildDataQualityReport({
  current,
  historical,
  sameRegimeCount,
  matchCount,
  onchainIntelligence,
  onchainState = "disabled"
}: {
  current: MarketSnapshot;
  historical: MarketSnapshot[];
  sameRegimeCount: number;
  matchCount: number;
  onchainIntelligence: OnchainIntelligenceSnapshot | null;
  onchainState?: OnchainOperationalState;
}): DataQualityReport {
  const all = [...historical, current].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const first = all[0] ?? null;
  const latest = all[all.length - 1] ?? null;
  const historyHours =
    first && latest ? Math.max(0, (latest.timestamp.getTime() - first.timestamp.getTime()) / 3_600_000) : 0;
  const expectedSnapshots = Math.max(
    1,
    Math.floor((historyHours * 60) / DATA_QUALITY_THRESHOLDS.snapshotIntervalMinutes) + 1
  );
  const coveragePercent = Math.min(100, (all.length / expectedSnapshots) * 100);
  const featureCompleteness = computeFeatureCompleteness(current, onchainIntelligence);

  const historyReady = historyHours >= DATA_QUALITY_THRESHOLDS.rarityHistoryHours;
  const snapshotReady = all.length >= DATA_QUALITY_THRESHOLDS.confidenceSnapshots;
  const regimeReady = sameRegimeCount >= DATA_QUALITY_THRESHOLDS.regimeMatches;
  const outcomeReady = matchCount >= DATA_QUALITY_THRESHOLDS.outcomeMatches;
  const featuresReady = featureCompleteness.score >= 70;

  const reasons = [
    historyReady ? null : `Needs at least ${DATA_QUALITY_THRESHOLDS.rarityHistoryHours}h of history for rarity and memory.`,
    snapshotReady ? null : `Needs at least ${DATA_QUALITY_THRESHOLDS.confidenceSnapshots} snapshots for evidence confidence.`,
    regimeReady ? null : `Needs at least ${DATA_QUALITY_THRESHOLDS.regimeMatches} same-regime snapshots for regime statistics.`,
    outcomeReady ? null : `Needs at least ${DATA_QUALITY_THRESHOLDS.outcomeMatches} historical matches with forward outcomes.`,
    featuresReady ? null : `Feature completeness is ${featureCompleteness.score.toFixed(0)}%; optional data is still missing.`
  ].filter((reason): reason is string => Boolean(reason));

  const readyCount = [historyReady, snapshotReady, regimeReady, outcomeReady, featuresReady].filter(Boolean).length;
  const score = Math.round((readyCount / 5) * 100);

  return {
    historyCoverage: {
      status: historyReady ? "ready" : "hidden",
      historyHours,
      requiredHours: DATA_QUALITY_THRESHOLDS.rarityHistoryHours,
      firstSnapshotAt: first?.timestamp ?? null,
      latestSnapshotAt: latest?.timestamp ?? null,
      reason: historyReady ? null : "Collecting historical data."
    },
    snapshotCoverage: {
      status: snapshotReady ? "ready" : "hidden",
      snapshots: all.length,
      expectedSnapshots,
      coveragePercent,
      reason: snapshotReady ? null : "Insufficient sample size."
    },
    regimeCoverage: {
      status: regimeReady ? "ready" : "hidden",
      sameRegimeSnapshots: sameRegimeCount,
      requiredSnapshots: DATA_QUALITY_THRESHOLDS.regimeMatches,
      reason: regimeReady ? null : "Same-regime sample is too small."
    },
    featureCompleteness,
    onchainCoverage: {
      status: onchainState === "healthy" ? "ready" : onchainState === "syncing" ? "limited" : "hidden",
      state: onchainState,
      reason: onchainState === "healthy" ? null : onchainReason(onchainState)
    },
    analysisReadiness: {
      status: reasons.length === 0 ? "ready" : score >= 60 ? "limited" : "hidden",
      score,
      reasons,
      hiddenMetrics: {
        rarity: !historyReady || !snapshotReady,
        confidence: !snapshotReady || !outcomeReady,
        regimeStatistics: !regimeReady,
        averageOutcome: !outcomeReady,
        clusterOutcomes: !snapshotReady,
        marketMemory: !historyReady || !snapshotReady
      }
    }
  };
}

export function displayRarityLabel(report: DataQualityReport, fallback = "Collecting historical data") {
  return report.analysisReadiness.hiddenMetrics.rarity ? fallback : null;
}

export function snapshotFreshnessStatus(latestSnapshotAt: Date | null, now = new Date()) {
  if (!latestSnapshotAt) {
    return {
      status: "hidden" as ReadinessStatus,
      ageMinutes: null,
      stale: true,
      reason: "No snapshots collected yet."
    };
  }

  const ageMinutes = Math.max(0, (now.getTime() - latestSnapshotAt.getTime()) / 60_000);
  const stale = ageMinutes > DATA_QUALITY_THRESHOLDS.staleSnapshotMinutes;
  return {
    status: stale ? ("limited" as const) : ("ready" as const),
    ageMinutes,
    stale,
    reason: stale ? `Latest snapshot is older than ${DATA_QUALITY_THRESHOLDS.staleSnapshotMinutes} minutes.` : null
  };
}

function computeFeatureCompleteness(
  snapshot: MarketSnapshot,
  onchain: OnchainIntelligenceSnapshot | null
): DataQualityReport["featureCompleteness"] {
  const features = [
    ["funding rate", snapshot.fundingRate],
    ["funding APR", snapshot.fundingApr],
    ["volume", snapshot.volume],
    ["volatility", snapshot.volatility],
    ["1h return", snapshot.return1hBefore],
    ["4h return", snapshot.return4hBefore],
    ["24h return", snapshot.return24hBefore],
    ["open interest", snapshot.openInterest],
    ["spread", snapshot.spread],
    ["orderbook imbalance", snapshot.orderbookImbalance],
    ["on-chain event velocity", onchain?.eventVelocity ?? null],
    ["on-chain active wallets", onchain?.uniqueWalletCount ?? null]
  ] as const;
  const missingFeatures = features
    .filter(([, value]) => value === null || value === undefined || !Number.isFinite(Number(value)))
    .map(([name]) => name);
  const availableFeatures = features.length - missingFeatures.length;
  const score = (availableFeatures / features.length) * 100;

  return {
    status: score >= 80 ? "ready" : score >= 55 ? "limited" : "hidden",
    score,
    availableFeatures,
    totalFeatures: features.length,
    missingFeatures,
    reason: missingFeatures.length ? `Missing ${missingFeatures.join(", ")}.` : null
  };
}

function onchainReason(state: OnchainOperationalState) {
  if (state === "disabled") return "On-chain indexer is disabled.";
  if (state === "not_configured") return "On-chain RPC or contract addresses are not configured.";
  if (state === "offline") return "On-chain RPC is configured but not reachable.";
  if (state === "syncing") return "On-chain indexer is syncing.";
  return null;
}

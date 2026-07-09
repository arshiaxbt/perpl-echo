import type {
  Market,
  MarketSnapshot,
  MarketStateCluster,
  MarketStateTransition,
  OnchainIntelligenceSnapshot,
  Prisma
} from "@prisma/client";
import { prisma } from "./prisma";
import { jsonSafePublic } from "./json";
import { fundingPercentile, rarityLabel, rarityScore } from "./metrics";
import { buildMarketMemory, type MarketMemory, rarityLabelFromScore } from "./market-memory";
import { classifySnapshot, ensureSnapshotRegime, parseReasons } from "./regime";
import { latestOnchainIntelligenceForMarket } from "./onchain-intelligence";
import { buildAnalysisHash } from "./analysis-hash";
import { currentClusterForMarket, currentEvolutionForMarket } from "./cluster-service";
import { crossMarketEcho } from "./cross-market";
import { buildEchoConfidence, scoreEcho, type EchoBreakdown } from "./echo-engine";
import { DATA_QUALITY_THRESHOLDS, buildDataQualityReport, type DataQualityReport } from "./data-quality";

type FeatureName =
  | "fundingZ"
  | "fundingPercentile"
  | "fundingApr"
  | "momentum"
  | "volumeZ"
  | "volatilityZ"
  | "oiZ"
  | "orderbookImbalance"
  | "spread"
  | "whaleActivityZ"
  | "uniqueWalletsZ"
  | "eventVelocityZ"
  | "walletConcentrationZ"
  | "liquidationActivityZ";

const baseWeights: Record<FeatureName, number> = {
  fundingZ: 0.1,
  fundingPercentile: 0.1,
  fundingApr: 0.1,
  momentum: 0.2,
  volumeZ: 0.15,
  volatilityZ: 0.15,
  oiZ: 0.1,
  orderbookImbalance: 0.1,
  spread: 0.04,
  whaleActivityZ: 0.04,
  uniqueWalletsZ: 0.03,
  eventVelocityZ: 0.03,
  walletConcentrationZ: 0.03,
  liquidationActivityZ: 0.03
};

const MIN_REGIME_SAMPLE_SIZE = 30;
const ANALYSIS_CACHE_TTL_MS = 60_000;
const analysisCache = new Map<string, { expiresAt: number; value: AnalyzeMarketStateResult }>();

export type HistoricalMatch = {
  snapshot: MarketSnapshot;
  similarity: number;
  echoScore?: number;
  echoBreakdown?: EchoBreakdown;
  outcome: FutureOutcome | null;
};

export type FutureOutcome = {
  return1h: number | null;
  return4h: number | null;
  return24h: number | null;
  fundingChange: number | null;
  fundingNormalized: boolean | null;
  maxUpside: number | null;
  maxDownside: number | null;
};

type MarketWithLatestSnapshot = Market & { snapshots: MarketSnapshot[] };
type CurrentClusterResult = {
  market: Market;
  snapshot: MarketSnapshot & { cluster: MarketStateCluster | null };
  cluster: MarketStateCluster | null;
} | null;
type EvolutionResult =
  | (NonNullable<CurrentClusterResult> & { transitions: Array<MarketStateTransition & { toCluster: MarketStateCluster }> })
  | null;
type CrossMarketResult = Awaited<ReturnType<typeof crossMarketEcho>>;

export type AnalyzeMarketStateResult = {
  market: MarketWithLatestSnapshot;
  current: MarketSnapshot;
  analysisHash: string;
  dataQuality: DataQualityReport;
  regime: {
    name: string;
    confidence: number;
    reasons: string[];
    sampleSize: number;
    warning: string | null;
  };
  marketMemory: MarketMemory;
  currentCluster: CurrentClusterResult;
  evolution: EvolutionResult;
  crossMarket: CrossMarketResult;
  echoConfidence: ReturnType<typeof buildEchoConfidence>;
  fundingRegimeMetrics: ReturnType<typeof fundingRegimeMetrics>;
  onchainIntelligence: OnchainIntelligenceSnapshot | null;
  fundingPercentile: number | null;
  rarityScore: number | null;
  rarityLabel: string;
  fundingRarityScore: number | null;
  fundingRarityLabel: string;
  sampleSize: number;
  matches: Array<{
    snapshot: MarketSnapshot;
    similarity: number;
    echoScore: number;
    echoBreakdown: EchoBreakdown;
    outcome: FutureOutcome;
  }>;
  averageOutcome: ReturnType<typeof averageOutcome>;
};

export async function analyzeMarketState(symbol: string, options: { persist?: boolean } = {}): Promise<AnalyzeMarketStateResult | null> {
  return analyzeMarketStateAt(symbol, undefined, options);
}

export async function analyzeMarketStateAt(
  symbol: string,
  timestamp?: Date,
  options: { persist?: boolean } = {}
): Promise<AnalyzeMarketStateResult | null> {
  const cacheKey = `${symbol.toUpperCase()}:${timestamp?.toISOString() ?? "latest"}:${options.persist === true ? "persist" : "read"}`;
  const cached = analysisCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const market = await prisma.market.findUnique({
    where: { symbol: symbol.toUpperCase() },
    include: {
      snapshots: {
        where: timestamp ? { timestamp: { lte: timestamp } } : undefined,
        orderBy: { timestamp: "desc" },
        take: 1
      }
    }
  });

  if (!market || market.snapshots.length === 0) return null;

  const current = market.snapshots[0];
  const regime = await ensureSnapshotRegime(current);
  const historical = await prisma.marketSnapshot.findMany({
    where: {
      marketId: market.id,
      timestamp: {
        lt: new Date(current.timestamp.getTime() - 60 * 60 * 1000)
      }
    },
    orderBy: { timestamp: "asc" },
    take: 20000
  });

  const classifiedHistorical = classifyHistoricalInMemory(historical);
  const sameRegime = classifiedHistorical.filter((snapshot) => snapshot.regime === regime.regime);
  const useRegimeOnly = sameRegime.length >= MIN_REGIME_SAMPLE_SIZE;
  let searchPool = useRegimeOnly ? sameRegime : classifiedHistorical;
  let regimeWarning = useRegimeOnly ? null : "Low sample size for this regime, using broader historical search.";
  const onchainIntelligence = await prisma.onchainIntelligenceSnapshot.findMany({
    where: { marketId: market.id, windowMinutes: 60 },
    orderBy: { timestamp: "asc" },
    take: 20000
  });
  const latestOnchainIntelligence = await latestOnchainIntelligenceForMarket(market.id, 60);
  const fundingRates = classifiedHistorical.filter((snapshot) => !isBackfilled(snapshot)).map((snapshot) => snapshot.fundingRate);
  const fundingRatesSorted = [...fundingRates].sort((a, b) => a - b);
  const percentile = fundingPercentile(current.fundingRate, fundingRates);

  const outcomeIndex = buildOutcomeIndex(classifiedHistorical);
  const intelligenceIndex = buildIntelligenceIndex(onchainIntelligence);
  const stats = buildStats([current, ...classifiedHistorical], onchainIntelligence);
  const currentOnchain = latestOnchainIntelligence ?? nearestIntelligence(current, intelligenceIndex);
  const currentVector = vectorize(current, stats, currentOnchain);
  let matches = buildMatches(searchPool, current, currentVector, stats, intelligenceIndex, outcomeIndex, fundingRatesSorted, percentile, memoryRarityPlaceholder(classifiedHistorical), currentOnchain);
  if (useRegimeOnly && matches.length < 10) {
    searchPool = classifiedHistorical;
    regimeWarning = "Low sample size for this regime, using broader historical search.";
    matches = buildMatches(searchPool, current, currentVector, stats, intelligenceIndex, outcomeIndex, fundingRatesSorted, percentile, memoryRarityPlaceholder(classifiedHistorical), currentOnchain);
  }

  const nearest = matches[0] ?? null;
  const memory: MarketMemory = buildMarketMemory({
    current,
    historical: classifiedHistorical,
    sameRegimeCount: sameRegime.length,
    nearestSimilarity: nearest?.similarity ?? null,
    lastSimilarStateAt: nearest?.snapshot.timestamp ?? null
  });

  const dataQuality = buildDataQualityReport({
    current,
    historical: classifiedHistorical,
    sameRegimeCount: sameRegime.length,
    matchCount: matches.length,
    onchainIntelligence: latestOnchainIntelligence,
    onchainState: latestOnchainIntelligence ? "healthy" : "disabled"
  });
  const currentCluster = await currentClusterForMarket(market.symbol);
  const evolution = await currentEvolutionForMarket(market.symbol);
  const crossMarket =
    matches.length >= DATA_QUALITY_THRESHOLDS.outcomeMatches
      ? await crossMarketEcho(market.symbol, matches.map((match) => match.snapshot.timestamp))
      : null;
  const analysisHash = buildAnalysisHash({ symbol: market.symbol, snapshot: current, clusterId: currentCluster?.cluster?.id ?? null });
  const featureCompleteness = computeFeatureCompleteness(current, latestOnchainIntelligence);
  const echoConfidence = buildEchoConfidence({
    matches,
    sameRegimeCount: sameRegime.length,
    totalSampleSize: searchPool.length,
    featureCompleteness,
    hasOnchain: Boolean(latestOnchainIntelligence),
    currentRegime: regime.regime
  });
  const visibleRarityScore = dataQuality.analysisReadiness.hiddenMetrics.rarity
    ? null
    : memory.rarityScore ?? rarityScore(percentile);
  const result = {
    market,
    current,
    analysisHash,
    dataQuality,
    regime: {
      name: regime.regime,
      confidence: regime.confidence,
      reasons: regime.reasons,
      sampleSize: sameRegime.length,
      warning: regimeWarning
    },
    marketMemory: memory,
    currentCluster,
    evolution,
    crossMarket,
    echoConfidence,
    fundingRegimeMetrics: fundingRegimeMetrics(current, classifiedHistorical),
    onchainIntelligence: latestOnchainIntelligence,
    fundingPercentile: percentile,
    rarityScore: visibleRarityScore,
    rarityLabel:
      visibleRarityScore === null ? "Collecting historical data" : rarityLabelFromScore(visibleRarityScore) ?? rarityLabel(percentile),
    fundingRarityScore: rarityScore(percentile),
    fundingRarityLabel: rarityLabel(percentile),
    sampleSize: searchPool.length,
    matches,
    averageOutcome: averageOutcome(matches.map((match) => match.outcome).filter(Boolean) as FutureOutcome[])
  };

  analysisCache.set(cacheKey, { expiresAt: Date.now() + ANALYSIS_CACHE_TTL_MS, value: result });

  if (options.persist === true && matches.length > 0) {
    await prisma.similaritySearch.create({
      data: {
        marketId: market.id,
        currentSnapshotId: current.id,
        resultsJson: jsonSafePublic(result)
      }
    });
  }

  return result;
}

function buildMatches(
  searchPool: MarketSnapshot[],
  current: MarketSnapshot,
  currentVector: Partial<Record<FeatureName, number>>,
  stats: Stats,
  intelligenceIndex: IntelligenceIndex,
  outcomeIndex: OutcomeIndex,
  fundingRatesSorted: number[],
  currentFundingPercentile: number | null,
  currentRarity: number | null,
  currentOnchain: OnchainIntelligenceSnapshot | null
) {
  return searchPool
    .map((snapshot) => {
      const candidateOnchain = nearestIntelligence(snapshot, intelligenceIndex);
      const similarity = weightedSimilarity(currentVector, vectorize(snapshot, stats, candidateOnchain));
      const candidateFundingPercentile = percentileSorted(snapshot.fundingRate, fundingRatesSorted);
      const candidateRarity = candidateFundingPercentile === null ? null : Math.max(candidateFundingPercentile, 100 - candidateFundingPercentile);
      const echoBreakdown = scoreEcho({
        current,
        candidate: snapshot,
        currentFundingPercentile,
        candidateFundingPercentile,
        currentOnchain,
        candidateOnchain,
        currentRarity,
        candidateRarity
      });
      return {
        snapshot,
        similarity,
        echoScore: echoBreakdown.echoScore,
        echoBreakdown,
        outcome: futureOutcome(snapshot, outcomeIndex)
      };
    })
    .filter(
      (match): match is {
        snapshot: MarketSnapshot;
        similarity: number;
        echoScore: number;
        echoBreakdown: EchoBreakdown;
        outcome: FutureOutcome;
      } =>
        Boolean(
          match.outcome &&
            match.outcome.return1h !== null &&
            match.outcome.return4h !== null &&
            match.outcome.return24h !== null
        )
    )
    .sort((a, b) => (b.echoScore ?? 0) - (a.echoScore ?? 0))
    .slice(0, 10);
}

function memoryRarityPlaceholder(historical: MarketSnapshot[]) {
  return historical.length > 0 ? 50 : null;
}

function classifyHistoricalInMemory(snapshots: MarketSnapshot[]) {
  const classified: MarketSnapshot[] = [];
  for (const snapshot of snapshots) {
    if (snapshot.regime && snapshot.regimeConfidence !== null) {
      classified.push(snapshot);
      continue;
    }
    const result = classifySnapshot(snapshot, classified);
    classified.push({
      ...snapshot,
      regime: result.regime,
      regimeConfidence: result.confidence,
      regimeReasonsJson: result.reasons
    });
  }
  return classified;
}

export async function regimeForSymbol(symbol: string) {
  const result = await analyzeMarketState(symbol, { persist: false });
  return result
    ? {
        market: result.market,
        current: result.current,
        regime: result.regime
      }
    : null;
}

export async function memoryForSymbol(symbol: string) {
  const result = await analyzeMarketState(symbol, { persist: false });
  return result
    ? {
        market: result.market,
        current: result.current,
        marketMemory: result.marketMemory
      }
    : null;
}

function vectorize(
  snapshot: MarketSnapshot,
  stats: Stats,
  onchain: OnchainIntelligenceSnapshot | null
): Partial<Record<FeatureName, number>> {
  const fundingPercent = percentile(snapshot.fundingRate, stats.fundingRates);
  const fundingAvailable = !isBackfilled(snapshot) && stats.fundingRates.length >= 50;
  return {
    fundingZ: fundingAvailable ? z(snapshot.fundingRate, stats.fundingRate) : undefined,
    fundingPercentile: fundingAvailable && fundingPercent !== null ? fundingPercent / 100 : undefined,
    fundingApr: fundingAvailable ? z(snapshot.fundingApr, stats.fundingApr) : undefined,
    momentum: z(snapshot.trendScore, stats.trendScore),
    volumeZ: z(snapshot.volumeChange, stats.volumeChange),
    volatilityZ: z(snapshot.volatility, stats.volatility),
    oiZ: snapshot.openInterest === null ? undefined : z(snapshot.openInterest, stats.openInterest),
    orderbookImbalance: snapshot.orderbookImbalance ?? undefined,
    spread: snapshot.spread === null ? undefined : z(snapshot.spread, stats.spread),
    whaleActivityZ: onchain?.whaleActivityScore === null || !onchain ? undefined : z(onchain.whaleActivityScore, stats.whaleActivity),
    uniqueWalletsZ: onchain?.uniqueWalletCount === null || !onchain ? undefined : z(onchain.uniqueWalletCount, stats.uniqueWallets),
    eventVelocityZ: onchain?.eventVelocity === null || !onchain ? undefined : z(onchain.eventVelocity, stats.eventVelocity),
    walletConcentrationZ:
      onchain?.walletConcentrationScore === null || !onchain ? undefined : z(onchain.walletConcentrationScore, stats.walletConcentration),
    liquidationActivityZ:
      onchain?.liquidationEventCount === null || !onchain ? undefined : z(onchain.liquidationEventCount, stats.liquidationActivity)
  };
}

function weightedSimilarity(a: Partial<Record<FeatureName, number>>, b: Partial<Record<FeatureName, number>>) {
  const features = Object.keys(baseWeights) as FeatureName[];
  const usable = features.filter((feature) => isFiniteNumber(a[feature]) && isFiniteNumber(b[feature]));
  const totalWeight = usable.reduce((sum, feature) => sum + baseWeights[feature], 0);
  if (totalWeight === 0) return 0;

  const distance = usable.reduce((sum, feature) => {
    const normalizedWeight = baseWeights[feature] / totalWeight;
    return sum + normalizedWeight * ((a[feature] as number) - (b[feature] as number)) ** 2;
  }, 0);

  return Math.max(0, Math.min(1, 1 / (1 + Math.sqrt(distance))));
}

function buildOutcomeIndex(snapshots: MarketSnapshot[]) {
  const sorted = [...snapshots].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  return {
    snapshots: sorted,
    timestamps: sorted.map((snapshot) => snapshot.timestamp.getTime())
  };
}

type OutcomeIndex = ReturnType<typeof buildOutcomeIndex>;

function futureOutcome(snapshot: MarketSnapshot, index: OutcomeIndex): FutureOutcome | null {
  const afterStart = upperBound(index.timestamps, snapshot.timestamp.getTime());
  if (afterStart >= index.snapshots.length) return null;

  const oneHour = nearestAfter(index, snapshot.timestamp.getTime() + 60 * 60 * 1000, afterStart);
  const fourHour = nearestAfter(index, snapshot.timestamp.getTime() + 4 * 60 * 60 * 1000, afterStart);
  const day = nearestAfter(index, snapshot.timestamp.getTime() + 24 * 60 * 60 * 1000, afterStart);
  if (!oneHour && !fourHour && !day && index.snapshots.length - afterStart < 3) return null;

  const window8h = windowAfter(index, afterStart, snapshot.timestamp.getTime() + 8 * 60 * 60 * 1000);
  const window24h = windowAfter(index, afterStart, snapshot.timestamp.getTime() + 24 * 60 * 60 * 1000);
  const fundingComparable = !isBackfilled(snapshot) && day && !isBackfilled(day);
  const fundingNormalized =
    fundingComparable && window8h.length > 0
      ? window8h.some((item) => !isBackfilled(item) && Math.abs(item.fundingRate) <= Math.abs(snapshot.fundingRate) * 0.5)
      : null;

  return {
    return1h: oneHour ? pctChange(oneHour.price, snapshot.price) : null,
    return4h: fourHour ? pctChange(fourHour.price, snapshot.price) : null,
    return24h: day ? pctChange(day.price, snapshot.price) : null,
    fundingChange: fundingComparable && day ? (day.fundingRate - snapshot.fundingRate) * 100 : null,
    fundingNormalized,
    maxUpside: window24h.length ? Math.max(...window24h.map((item) => pctChange(item.price, snapshot.price))) : null,
    maxDownside: window24h.length ? Math.min(...window24h.map((item) => pctChange(item.price, snapshot.price))) : null
  };
}

function fundingRegimeMetrics(current: MarketSnapshot, historical: MarketSnapshot[]) {
  const allFunding = historical.filter((snapshot) => !isBackfilled(snapshot)).map((snapshot) => snapshot.fundingRate);
  const thirtyDaysAgo = current.timestamp.getTime() - 30 * 24 * 60 * 60 * 1000;
  const funding30d = historical
    .filter((snapshot) => snapshot.timestamp.getTime() >= thirtyDaysAgo && !isBackfilled(snapshot))
    .map((snapshot) => snapshot.fundingRate);
  const ordered = [...historical.filter((snapshot) => snapshot.timestamp <= current.timestamp), current].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );
  let positiveStreak = current.fundingRate > 0 ? 1 : 0;
  let negativeStreak = current.fundingRate < 0 ? 1 : 0;
  for (const snapshot of ordered.slice(0, -1).reverse()) {
    if (current.fundingRate > 0 && snapshot.fundingRate > 0) positiveStreak += 1;
    else if (current.fundingRate < 0 && snapshot.fundingRate < 0) negativeStreak += 1;
    else break;
  }
  const allTime = percentile(current.fundingRate, allFunding);
  const thirtyDay = percentile(current.fundingRate, funding30d);
  const extremePercentile = allTime !== null ? Math.max(allTime, 100 - allTime) : null;

  return {
    fundingPercentile30d: thirtyDay,
    fundingPercentileAllTime: allTime,
    fundingPositiveStreak: positiveStreak,
    fundingNegativeStreak: negativeStreak,
    fundingPersistenceHours: ((current.fundingRate > 0 ? positiveStreak : negativeStreak) * 5) / 60,
    fundingIsExtreme: extremePercentile !== null ? extremePercentile >= 95 : false
  };
}

function nearestAfter(index: OutcomeIndex, targetMs: number, lowerIndex = 0) {
  const toleranceMs = 15 * 60 * 1000;
  const insertion = Math.max(lowerIndex, lowerBound(index.timestamps, targetMs));
  const candidates = [insertion - 1, insertion, insertion + 1]
    .filter((itemIndex) => itemIndex >= lowerIndex && itemIndex >= 0 && itemIndex < index.snapshots.length)
    .map((itemIndex) => index.snapshots[itemIndex])
    .filter((item) => Math.abs(item.timestamp.getTime() - targetMs) <= toleranceMs)
    .sort((a, b) => Math.abs(a.timestamp.getTime() - targetMs) - Math.abs(b.timestamp.getTime() - targetMs));

  return candidates[0] ?? null;
}

function windowAfter(index: OutcomeIndex, startIndex: number, endMs: number) {
  const endIndex = upperBound(index.timestamps, endMs);
  return index.snapshots.slice(startIndex, endIndex);
}

function lowerBound(values: number[], target: number) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (values[mid] < target) low = mid + 1;
    else high = mid;
  }
  return low;
}

function upperBound(values: number[], target: number) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (values[mid] <= target) low = mid + 1;
    else high = mid;
  }
  return low;
}

function averageOutcome(outcomes: FutureOutcome[]) {
  return {
    return1h: avg(outcomes.map((outcome) => outcome.return1h)),
    return4h: avg(outcomes.map((outcome) => outcome.return4h)),
    return24h: avg(outcomes.map((outcome) => outcome.return24h)),
    fundingChange: avg(outcomes.map((outcome) => outcome.fundingChange)),
    maxUpside: avg(outcomes.map((outcome) => outcome.maxUpside)),
    maxDownside: avg(outcomes.map((outcome) => outcome.maxDownside)),
    fundingNormalizedRate: percentTrue(outcomes.map((outcome) => outcome.fundingNormalized))
  };
}

function buildStats(snapshots: MarketSnapshot[], intelligence: OnchainIntelligenceSnapshot[]) {
  const fundingSnapshots = snapshots.filter((snapshot) => !isBackfilled(snapshot));
  return {
    fundingRates: fundingSnapshots.map((snapshot) => snapshot.fundingRate),
    fundingRate: stat(fundingSnapshots.map((snapshot) => snapshot.fundingRate)),
    fundingApr: stat(fundingSnapshots.map((snapshot) => snapshot.fundingApr)),
    trendScore: stat(snapshots.map((snapshot) => snapshot.trendScore)),
    volumeChange: stat(snapshots.map((snapshot) => snapshot.volumeChange)),
    volatility: stat(snapshots.map((snapshot) => snapshot.volatility)),
    openInterest: stat(snapshots.map((snapshot) => snapshot.openInterest)),
    spread: stat(snapshots.map((snapshot) => snapshot.spread)),
    whaleActivity: stat(intelligence.map((snapshot) => snapshot.whaleActivityScore)),
    uniqueWallets: stat(intelligence.map((snapshot) => snapshot.uniqueWalletCount)),
    eventVelocity: stat(intelligence.map((snapshot) => snapshot.eventVelocity)),
    walletConcentration: stat(intelligence.map((snapshot) => snapshot.walletConcentrationScore)),
    liquidationActivity: stat(intelligence.map((snapshot) => snapshot.liquidationEventCount))
  };
}

type Stats = ReturnType<typeof buildStats>;

function stat(values: Array<number | null>) {
  const sample = values.filter(isFiniteNumber);
  const mean = sample.length ? sample.reduce((sum, value) => sum + value, 0) / sample.length : 0;
  const variance = sample.length > 1 ? sample.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (sample.length - 1) : 0;
  return { mean, sd: Math.sqrt(variance) || 1 };
}

function z(value: number | null, statValue: { mean: number; sd: number }) {
  if (!isFiniteNumber(value)) return undefined;
  return (value - statValue.mean) / statValue.sd;
}

function percentile(value: number, values: number[]) {
  const sample = values.filter(isFiniteNumber);
  if (!sample.length) return null;
  return (sample.filter((item) => item <= value).length / sample.length) * 100;
}

function percentileSorted(value: number, sortedValues: number[]) {
  if (!sortedValues.length) return null;
  return (upperBound(sortedValues, value) / sortedValues.length) * 100;
}

function avg(values: Array<number | null>) {
  const sample = values.filter(isFiniteNumber);
  return sample.length ? sample.reduce((sum, value) => sum + value, 0) / sample.length : null;
}

function percentTrue(values: Array<boolean | null>) {
  const sample = values.filter((value): value is boolean => typeof value === "boolean");
  return sample.length ? (sample.filter(Boolean).length / sample.length) * 100 : null;
}

function pctChange(current: number, previous: number) {
  return previous > 0 ? ((current - previous) / previous) * 100 : 0;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBackfilled(snapshot: Pick<MarketSnapshot, "rawJson">) {
  const raw = snapshot.rawJson as Prisma.JsonObject | null;
  return raw?.source === "candle_backfill";
}

function buildIntelligenceIndex(intelligence: OnchainIntelligenceSnapshot[]) {
  const sorted = [...intelligence].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  return {
    snapshots: sorted,
    timestamps: sorted.map((snapshot) => snapshot.timestamp.getTime())
  };
}

type IntelligenceIndex = ReturnType<typeof buildIntelligenceIndex>;

function nearestIntelligence(snapshot: MarketSnapshot, intelligence: IntelligenceIndex) {
  if (!intelligence.snapshots.length) return null;
  const maxAgeMs = 6 * 60 * 60 * 1000;
  const targetMs = snapshot.timestamp.getTime();
  const itemIndex = upperBound(intelligence.timestamps, targetMs) - 1;
  if (itemIndex < 0) return null;
  const item = intelligence.snapshots[itemIndex];
  return targetMs - item.timestamp.getTime() <= maxAgeMs ? item : null;
}

function computeFeatureCompleteness(snapshot: MarketSnapshot, onchain: OnchainIntelligenceSnapshot | null) {
  const values = [
    snapshot.fundingRate,
    snapshot.fundingApr,
    snapshot.volume,
    snapshot.volatility,
    snapshot.return1hBefore,
    snapshot.return4hBefore,
    snapshot.return24hBefore,
    snapshot.openInterest,
    snapshot.spread,
    snapshot.orderbookImbalance,
    onchain?.eventVelocity ?? null,
    onchain?.uniqueWalletCount ?? null
  ];
  return values.filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value))).length / values.length;
}

export async function onchainIntelligenceForSymbol(symbol: string) {
  const market = await prisma.market.findUnique({ where: { symbol: symbol.toUpperCase() } });
  if (!market) return null;
  const snapshots = await prisma.onchainIntelligenceSnapshot.findMany({
    where: { marketId: market.id },
    orderBy: [{ windowMinutes: "asc" }, { timestamp: "desc" }],
    take: 100
  });
  return { market, snapshots };
}

export async function timelineForSymbol(symbol: string, range: string) {
  const market = await prisma.market.findUnique({ where: { symbol: symbol.toUpperCase() } });
  if (!market) return null;
  const hours = rangeToHours(range);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const snapshots = await prisma.marketSnapshot.findMany({
    where: { marketId: market.id, timestamp: { gte: since } },
    orderBy: { timestamp: "asc" },
    take: 3000
  });
  const intelligence = await prisma.onchainIntelligenceSnapshot.findMany({
    where: { marketId: market.id, timestamp: { gte: since }, windowMinutes: 60 },
    orderBy: { timestamp: "asc" },
    take: 3000
  });
  const intelligenceIndex = buildIntelligenceIndex(intelligence);

  return {
    market,
    range,
    snapshots: snapshots.map((snapshot) => ({
      ...snapshot,
      regimeReasons: parseReasons(snapshot.regimeReasonsJson),
      onchainIntelligence: nearestIntelligence(snapshot, intelligenceIndex)
    }))
  };
}

function rangeToHours(range: string) {
  if (range === "1h") return 1;
  if (range === "4h") return 4;
  if (range === "7d") return 24 * 7;
  return 24;
}

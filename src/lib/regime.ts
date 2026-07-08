import type { MarketSnapshot, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { clamp } from "./utils";

export const MARKET_REGIMES = [
  "TREND_UP",
  "TREND_DOWN",
  "SIDEWAYS",
  "SQUEEZE",
  "PANIC",
  "CALM",
  "VOLATILITY_EXPANSION",
  "VOLATILITY_COMPRESSION",
  "FUNDING_EXTREME_POSITIVE",
  "FUNDING_EXTREME_NEGATIVE"
] as const;

export type MarketRegime = (typeof MARKET_REGIMES)[number];

export type RegimeClassification = {
  regime: MarketRegime;
  confidence: number;
  reasons: string[];
};

type SnapshotLike = Pick<
  MarketSnapshot,
  | "id"
  | "marketId"
  | "timestamp"
  | "fundingRate"
  | "volumeChange"
  | "volatility"
  | "return1hBefore"
  | "return4hBefore"
  | "return24hBefore"
  | "trendScore"
  | "openInterest"
  | "rawJson"
>;

export async function ensureSnapshotRegime(snapshot: MarketSnapshot) {
  if (snapshot.regime && snapshot.regimeConfidence !== null) {
    return {
      regime: snapshot.regime as MarketRegime,
      confidence: snapshot.regimeConfidence,
      reasons: parseReasons(snapshot.regimeReasonsJson)
    };
  }

  const history = await prisma.marketSnapshot.findMany({
    where: {
      marketId: snapshot.marketId,
      timestamp: { lt: snapshot.timestamp }
    },
    orderBy: { timestamp: "desc" },
    take: 5000
  });
  const classification = classifySnapshot(snapshot, history.reverse());

  await prisma.marketSnapshot.update({
    where: { id: snapshot.id },
    data: {
      regime: classification.regime,
      regimeConfidence: classification.confidence,
      regimeReasonsJson: classification.reasons
    }
  });

  return classification;
}

export async function classifyMissingRegimes(marketId: number, limit = 20000) {
  const snapshots = await prisma.marketSnapshot.findMany({
    where: {
      marketId
    },
    orderBy: { timestamp: "asc" },
    take: limit
  });

  const classified: SnapshotLike[] = [];
  const updates = new Map<string, { data: Pick<MarketSnapshot, "regime" | "regimeConfidence"> & { regimeReasonsJson: string[] }; ids: string[] }>();
  let changed = 0;

  for (const snapshot of snapshots) {
    if (snapshot.regime && snapshot.regimeConfidence !== null) {
      classified.push(snapshot);
      continue;
    }

    const history = classified.slice(-5000);
    const classification = classifySnapshot(snapshot, history);
    const data = {
      regime: classification.regime,
      regimeConfidence: classification.confidence,
      regimeReasonsJson: classification.reasons
    };
    const key = JSON.stringify(data);
    const group = updates.get(key) ?? { data, ids: [] };
    group.ids.push(snapshot.id);
    updates.set(key, group);
    classified.push(snapshot);
    changed += 1;
  }

  for (const group of updates.values()) {
    for (const ids of chunks(group.ids, 500)) {
      await prisma.marketSnapshot.updateMany({
        where: { id: { in: ids } },
        data: {
          regime: group.data.regime,
          regimeConfidence: group.data.regimeConfidence,
          regimeReasonsJson: group.data.regimeReasonsJson
        }
      });
    }
  }

  return changed;
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export function classifySnapshot(snapshot: SnapshotLike, history: SnapshotLike[]): RegimeClassification {
  const reasons: string[] = [];
  const fundingSample = history.filter((item) => !isBackfilled(item)).map((item) => item.fundingRate);
  const fundingPct = percentile(snapshot.fundingRate, fundingSample);
  const volatilityAvg24h = avg(history.slice(-288).map((item) => item.volatility));
  const volatilityAvg4h = avg(history.slice(-48).map((item) => item.volatility));
  const volumeStats = stat(history.slice(-288).map((item) => item.volumeChange));
  const volumeZ = z(snapshot.volumeChange, volumeStats);
  const fundingStreak = fundingPersistence(history, snapshot.fundingRate);

  if (fundingPct !== null && fundingPct >= 95 && snapshot.fundingRate > 0) {
    reasons.push("funding above 95th percentile");
    if (fundingStreak >= 6) reasons.push("funding positive for many consecutive intervals");
    return build("FUNDING_EXTREME_POSITIVE", reasons, 0.82 + Math.min(0.12, (fundingPct - 95) / 100));
  }

  if (fundingPct !== null && fundingPct <= 5 && snapshot.fundingRate < 0) {
    reasons.push("funding below 5th percentile");
    if (fundingStreak >= 6) reasons.push("funding negative for many consecutive intervals");
    return build("FUNDING_EXTREME_NEGATIVE", reasons, 0.82 + Math.min(0.12, (5 - fundingPct) / 100));
  }

  if (volatilityAvg24h !== null && snapshot.volatility > volatilityAvg24h * 1.35) {
    reasons.push("volatility rising vs 24h average");
  }
  if (volumeZ >= 2) {
    reasons.push("volume spike above 2 standard deviations");
  }
  if (snapshot.openInterest !== null && snapshot.return4hBefore > 0 && snapshot.trendScore > 0) {
    reasons.push("price return positive while OI is available and momentum is rising");
  }

  if ((snapshot.return1hBefore <= -2 || snapshot.return4hBefore <= -4) && (volumeZ >= 1.5 || snapshot.volatility > (volatilityAvg24h ?? 0) * 1.25)) {
    reasons.push("sharp negative return with elevated activity");
    return build("PANIC", reasons, 0.78);
  }

  if (volatilityAvg24h !== null && snapshot.volatility > volatilityAvg24h * 1.25) {
    return build("VOLATILITY_EXPANSION", reasons.length ? reasons : ["volatility expanding vs 24h average"], 0.72);
  }

  if (volatilityAvg24h !== null && snapshot.volatility < volatilityAvg24h * 0.7 && volatilityAvg4h !== null && volatilityAvg4h < volatilityAvg24h * 0.85) {
    return build("VOLATILITY_COMPRESSION", ["volatility compressing vs 24h average"], 0.7);
  }

  if (Math.abs(snapshot.return24hBefore) < 1.2 && snapshot.volatility < (volatilityAvg24h ?? snapshot.volatility + 1) * 0.85) {
    return build("CALM", ["price range is tight and volatility is low"], 0.7);
  }

  if (Math.abs(snapshot.return4hBefore) < 1.5 && volumeZ > 1) {
    return build("SQUEEZE", ["sideways price action with rising activity"], 0.68);
  }

  if (snapshot.return4hBefore > 1.5 || snapshot.return24hBefore > 3 || snapshot.trendScore > 1.25) {
    return build("TREND_UP", ["positive multi-window price momentum"], 0.69);
  }

  if (snapshot.return4hBefore < -1.5 || snapshot.return24hBefore < -3 || snapshot.trendScore < -1.25) {
    return build("TREND_DOWN", ["negative multi-window price momentum"], 0.69);
  }

  return build("SIDEWAYS", ["returns are muted across recent windows"], 0.62);
}

function build(regime: MarketRegime, reasons: string[], confidence: number): RegimeClassification {
  return {
    regime,
    confidence: clamp(confidence + Math.min(0.08, Math.max(0, reasons.length - 1) * 0.02), 0.35, 0.95),
    reasons
  };
}

export function parseReasons(value: Prisma.JsonValue | null): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function fundingPersistence(history: SnapshotLike[], currentRate: number) {
  const sign = Math.sign(currentRate);
  if (sign === 0) return 0;
  const ordered = [...history].reverse();
  let streak = 1;
  for (const snapshot of ordered) {
    if (Math.sign(snapshot.fundingRate) !== sign) break;
    streak += 1;
  }
  return streak;
}

function percentile(value: number, values: number[]) {
  const sample = values.filter(isFiniteNumber);
  if (sample.length < 50) return null;
  return (sample.filter((item) => item <= value).length / sample.length) * 100;
}

function stat(values: Array<number | null>) {
  const sample = values.filter(isFiniteNumber);
  const mean = sample.length ? sample.reduce((sum, value) => sum + value, 0) / sample.length : 0;
  const variance = sample.length > 1 ? sample.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (sample.length - 1) : 0;
  return { mean, sd: Math.sqrt(variance) || 1 };
}

function z(value: number | null, stats: { mean: number; sd: number }) {
  return isFiniteNumber(value) ? (value - stats.mean) / stats.sd : 0;
}

function avg(values: Array<number | null>) {
  const sample = values.filter(isFiniteNumber);
  return sample.length ? sample.reduce((sum, value) => sum + value, 0) / sample.length : null;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBackfilled(snapshot: Pick<MarketSnapshot, "rawJson">) {
  const raw = snapshot.rawJson as Prisma.JsonObject | null;
  return raw?.source === "candle_backfill";
}

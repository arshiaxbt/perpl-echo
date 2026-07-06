import type { MarketSnapshot } from "@prisma/client";
import { clamp } from "./utils";

export type MarketMemory = {
  rarityScore: number;
  nearestClusterName: string;
  lastSimilarStateAt: Date | null;
  historicalFrequencyPercent: number;
  sampleSize: number;
  stateAgeDays: number | null;
};

export function buildMarketMemory({
  current,
  historical,
  sameRegimeCount,
  nearestSimilarity,
  lastSimilarStateAt
}: {
  current: MarketSnapshot;
  historical: MarketSnapshot[];
  sameRegimeCount: number;
  nearestSimilarity: number | null;
  lastSimilarStateAt: Date | null;
}): MarketMemory {
  const sampleSize = historical.length;
  const historicalFrequencyPercent = sampleSize ? (sameRegimeCount / sampleSize) * 100 : 0;
  const similarityPenalty = nearestSimilarity === null ? 18 : clamp((0.88 - nearestSimilarity) * 70, 0, 24);
  const baseRarity = 100 - historicalFrequencyPercent;
  const rarityScore = clamp(baseRarity + similarityPenalty, 0, 100);
  const stateAgeDays = lastSimilarStateAt ? (Date.now() - lastSimilarStateAt.getTime()) / (24 * 60 * 60 * 1000) : null;

  return {
    rarityScore,
    nearestClusterName: clusterName(current),
    lastSimilarStateAt,
    historicalFrequencyPercent,
    sampleSize,
    stateAgeDays
  };
}

export function clusterName(snapshot: MarketSnapshot) {
  const regime = snapshot.regime;
  if (regime === "FUNDING_EXTREME_POSITIVE") return "Extreme Positive Funding";
  if (regime === "FUNDING_EXTREME_NEGATIVE") return "Extreme Negative Funding";
  if (regime === "PANIC") return "Panic Flush";
  if (regime === "SQUEEZE") return "Squeeze Setup";
  if (regime === "VOLATILITY_EXPANSION") return "Volatility Breakout";
  if (regime === "CALM") return "Calm Accumulation";
  if (regime === "TREND_UP" && snapshot.fundingRate > 0) return "Crowded Longs";
  if (regime === "TREND_DOWN" && snapshot.fundingRate < 0) return "Crowded Shorts";
  if (snapshot.volumeChange < -20 || snapshot.spread !== null && snapshot.spread > 0.1) return "Low Liquidity Chop";
  return "Market Memory";
}

export function rarityLabelFromScore(score: number) {
  if (score >= 90) return "Very Rare";
  if (score >= 75) return "Rare";
  if (score >= 55) return "Uncommon";
  return "Common";
}

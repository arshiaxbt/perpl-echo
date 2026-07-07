import type { MarketSnapshot, OnchainIntelligenceSnapshot } from "@prisma/client";
import { clamp } from "./utils";

export type EchoBreakdown = {
  echoScore: number;
  regimeScore: number;
  fundingScore: number;
  structureScore: number;
  onchainScore: number;
  temporalScore: number;
  rarityScore: number;
  explanationJson: string[];
};

export type EchoConfidence = {
  confidenceScore: number | null;
  confidenceLabel: "INSUFFICIENT_DATA" | "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
  confidenceReasonsJson: string[];
};

export function scoreEcho({
  current,
  candidate,
  currentFundingPercentile,
  candidateFundingPercentile,
  currentOnchain,
  candidateOnchain,
  currentRarity,
  candidateRarity
}: {
  current: MarketSnapshot;
  candidate: MarketSnapshot;
  currentFundingPercentile: number | null;
  candidateFundingPercentile: number | null;
  currentOnchain: OnchainIntelligenceSnapshot | null;
  candidateOnchain: OnchainIntelligenceSnapshot | null;
  currentRarity: number | null;
  candidateRarity: number | null;
}): EchoBreakdown {
  const explanationJson: string[] = [];
  const regimeScore = current.regime && candidate.regime && current.regime === candidate.regime ? 100 : current.regime && candidate.regime ? 55 : 45;
  if (regimeScore === 100) explanationJson.push(`Same regime: ${current.regime}`);
  else explanationJson.push("Broader regime fallback used");

  const fundingDiff = currentFundingPercentile !== null && candidateFundingPercentile !== null ? Math.abs(currentFundingPercentile - candidateFundingPercentile) : Math.abs(current.fundingApr - candidate.fundingApr);
  const fundingScore = clamp(100 - fundingDiff, 0, 100);
  explanationJson.push(`Funding percentile difference: ${fundingDiff.toFixed(1)}%`);

  const volatilityDiff = Math.abs(current.volatility - candidate.volatility);
  const momentumDiff = Math.abs(current.trendScore - candidate.trendScore);
  const structureScore = clamp(100 - volatilityDiff * 8 - momentumDiff * 8 - Math.abs(current.volumeChange - candidate.volumeChange) * 0.15, 0, 100);
  if (volatilityDiff < 1.5) explanationJson.push("Volatility regime matched");

  const onchainScore = currentOnchain && candidateOnchain && currentOnchain.eventVelocity !== null && candidateOnchain.eventVelocity !== null
    ? clamp(100 - Math.abs(currentOnchain.eventVelocity - candidateOnchain.eventVelocity) * 20, 0, 100)
    : 55;
  if (currentOnchain && candidateOnchain) explanationJson.push("On-chain event velocity similar");
  else explanationJson.push("On-chain comparison unavailable, neutral score used");

  const ageDays = Math.max(0, (Date.now() - candidate.timestamp.getTime()) / (24 * 60 * 60 * 1000));
  const temporalScore = clamp(100 - ageDays * 1.2, 35, 100);
  if (temporalScore > 70) explanationJson.push("Candidate is recent enough to improve reliability");

  const rarityScore = currentRarity !== null && candidateRarity !== null ? clamp(100 - Math.abs(currentRarity - candidateRarity), 0, 100) : 60;
  const echoScore =
    regimeScore * 0.22 +
    fundingScore * 0.2 +
    structureScore * 0.2 +
    onchainScore * 0.12 +
    temporalScore * 0.12 +
    rarityScore * 0.14;

  return {
    echoScore: clamp(echoScore, 0, 100),
    regimeScore,
    fundingScore,
    structureScore,
    onchainScore,
    temporalScore,
    rarityScore,
    explanationJson
  };
}

export function buildEchoConfidence({
  matches,
  sameRegimeCount,
  totalSampleSize,
  featureCompleteness,
  hasOnchain,
  currentRegime
}: {
  matches: Array<{ echoScore?: number; snapshot: MarketSnapshot }>;
  sameRegimeCount: number;
  totalSampleSize: number;
  featureCompleteness: number;
  hasOnchain: boolean;
  currentRegime?: string | null;
}): EchoConfidence {
  if (totalSampleSize < 100 || matches.length < 10) {
    const confidenceReasonsJson = [
      totalSampleSize < 100 ? `Needs at least 100 historical snapshots; currently has ${totalSampleSize}.` : null,
      matches.length < 10 ? `Needs at least 10 historical matches with forward outcomes; currently has ${matches.length}.` : null,
      "Confidence is evidence quality only, not future price certainty."
    ].filter((reason): reason is string => Boolean(reason));

    return {
      confidenceScore: null,
      confidenceLabel: "INSUFFICIENT_DATA",
      confidenceReasonsJson
    };
  }

  const avgEcho = matches.length ? matches.reduce((sum, match) => sum + (match.echoScore ?? 0), 0) / matches.length : 0;
  const regimeConsistency =
    matches.length && currentRegime
      ? matches.filter((match) => match.snapshot.regime === currentRegime).length / matches.length
      : 0;
  const sampleScore = clamp(Math.log10(Math.max(1, totalSampleSize)) * 25, 0, 100);
  const sameRegimeScore = clamp((sameRegimeCount / Math.max(1, totalSampleSize)) * 180, 0, 100);
  const score = clamp(sampleScore * 0.25 + avgEcho * 0.25 + regimeConsistency * 100 * 0.18 + featureCompleteness * 100 * 0.2 + (hasOnchain ? 100 : 45) * 0.12 + sameRegimeScore * 0.1, 0, 100);
  const confidenceLabel = score >= 85 ? "VERY_HIGH" : score >= 70 ? "HIGH" : score >= 45 ? "MEDIUM" : "LOW";
  const confidenceReasonsJson = [
    `${totalSampleSize} historical states available`,
    `${Math.round(regimeConsistency * 100)}% regime consistency inside returned echoes`,
    `${Math.round(featureCompleteness * 100)}% feature completeness`,
    hasOnchain ? "On-chain data available" : "On-chain data not available for this state"
  ];
  if (avgEcho > 75) confidenceReasonsJson.push(`Average Echo Score is ${avgEcho.toFixed(1)}`);
  return { confidenceScore: score, confidenceLabel, confidenceReasonsJson };
}

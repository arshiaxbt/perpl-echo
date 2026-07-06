import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fundingPercentile, rarityLabel, rarityScore } from "@/lib/metrics";

export async function GET() {
  const markets = await prisma.market.findMany({
    where: { active: true },
    select: {
      id: true,
      symbol: true,
      baseAsset: true,
      quoteAsset: true,
      active: true,
      name: true,
      priceDecimals: true,
      sizeDecimals: true,
      createdAt: true,
      updatedAt: true,
      snapshots: {
        orderBy: { timestamp: "desc" },
        take: 1,
        select: {
          id: true,
          marketId: true,
          timestamp: true,
          price: true,
          indexPrice: true,
          fundingRate: true,
          fundingApr: true,
          volume: true,
          openInterest: true,
          spread: true,
          orderbookImbalance: true,
          volatility: true,
          return1hBefore: true,
          return4hBefore: true,
          return24hBefore: true,
          volumeChange: true,
          trendScore: true,
          regime: true,
          regimeConfidence: true,
          regimeReasonsJson: true,
          createdAt: true
        }
      }
    },
    orderBy: { symbol: "asc" }
  });

  const enriched = await Promise.all(
    markets.map(async (market) => {
      const latest = market.snapshots[0] ?? null;
      const rates = await prisma.marketSnapshot.findMany({
        where: { marketId: market.id },
        select: { fundingRate: true },
        orderBy: { timestamp: "desc" },
        take: 5000
      });
      const percentile = latest ? fundingPercentile(latest.fundingRate, rates.map((row) => row.fundingRate)) : null;
      return {
        ...market,
        latest,
        fundingPercentile: percentile,
        rarityScore: rarityScore(percentile),
        rarityLabel: rarityLabel(percentile)
      };
    })
  );

  return NextResponse.json(enriched);
}

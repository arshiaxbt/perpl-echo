import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fundingPercentile, rarityLabel, rarityScore } from "@/lib/metrics";

type Params = {
  params: Promise<{ symbol: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const { symbol } = await params;
  const market = await prisma.market.findUnique({
    where: { symbol: symbol.toUpperCase() },
    include: {
      snapshots: {
        orderBy: { timestamp: "desc" },
        take: 288
      }
    }
  });

  if (!market) {
    return NextResponse.json({ error: "Market not found" }, { status: 404 });
  }

  const latest = market.snapshots[0] ?? null;
  const percentile = latest
    ? fundingPercentile(latest.fundingRate, market.snapshots.map((snapshot) => snapshot.fundingRate))
    : null;

  return NextResponse.json({
    ...market,
    latest,
    fundingPercentile: percentile,
    rarityScore: rarityScore(percentile),
    rarityLabel: rarityLabel(percentile)
  });
}

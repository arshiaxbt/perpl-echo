import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ symbol: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const { symbol } = await params;
  const market = await prisma.market.findUnique({
    where: { symbol: symbol.toUpperCase() }
  });

  if (!market) {
    return NextResponse.json({ error: "Market not found" }, { status: 404 });
  }

  const latest = await prisma.marketSnapshot.findFirst({
    where: { marketId: market.id },
    orderBy: { timestamp: "desc" },
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
      clusterId: true,
      createdAt: true
    }
  });

  if (!latest) {
    return NextResponse.json({ error: "No snapshots available" }, { status: 404 });
  }

  return NextResponse.json(latest);
}

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
    orderBy: { timestamp: "desc" }
  });

  if (!latest) {
    return NextResponse.json({ error: "No snapshots available" }, { status: 404 });
  }

  return NextResponse.json(latest);
}

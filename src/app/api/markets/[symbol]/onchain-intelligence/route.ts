import { NextResponse } from "next/server";
import { onchainIntelligenceForSymbol } from "@/lib/similarity";
import { jsonSafePublic } from "@/lib/json";

type Params = {
  params: Promise<{ symbol: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const { symbol } = await params;
  const result = await onchainIntelligenceForSymbol(symbol);
  if (!result) return NextResponse.json({ error: "On-chain intelligence unavailable" }, { status: 404 });
  return NextResponse.json(jsonSafePublic(result));
}

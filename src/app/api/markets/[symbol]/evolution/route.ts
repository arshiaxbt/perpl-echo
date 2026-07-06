import { NextResponse } from "next/server";
import { currentEvolutionForMarket } from "@/lib/cluster-service";
import { jsonSafePublic } from "@/lib/json";

type Params = {
  params: Promise<{ symbol: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const { symbol } = await params;
  const result = await currentEvolutionForMarket(symbol);
  if (!result) return NextResponse.json({ error: "Market evolution unavailable" }, { status: 404 });
  return NextResponse.json(jsonSafePublic(result));
}

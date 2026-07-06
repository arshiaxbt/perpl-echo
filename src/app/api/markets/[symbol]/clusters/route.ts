import { NextResponse } from "next/server";
import { clustersForMarket } from "@/lib/cluster-service";
import { jsonSafePublic } from "@/lib/json";

type Params = {
  params: Promise<{ symbol: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const { symbol } = await params;
  const result = await clustersForMarket(symbol);
  if (!result) return NextResponse.json({ error: "Clusters unavailable" }, { status: 404 });
  return NextResponse.json(jsonSafePublic(result));
}

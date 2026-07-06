import { NextResponse } from "next/server";
import { analyzeMarketStateAt } from "@/lib/similarity";
import { jsonSafePublic } from "@/lib/json";

type Params = {
  params: Promise<{ symbol: string }>;
};

export async function GET(request: Request, { params }: Params) {
  const { symbol } = await params;
  const { searchParams } = new URL(request.url);
  const timestamp = searchParams.get("timestamp");
  const parsed = timestamp ? new Date(timestamp) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return NextResponse.json({ error: "Valid timestamp query parameter is required" }, { status: 400 });
  }

  const result = await analyzeMarketStateAt(symbol, parsed, { persist: false });
  if (!result) return NextResponse.json({ error: "Analysis unavailable at timestamp" }, { status: 404 });
  return NextResponse.json(jsonSafePublic({
    ...result,
    matches: result.matches.slice(0, 3)
  }));
}

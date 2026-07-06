import { NextResponse } from "next/server";
import { analyzeMarketState } from "@/lib/similarity";
import { jsonSafePublic } from "@/lib/json";

type Params = {
  params: Promise<{ symbol: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const { symbol } = await params;

  const result = await analyzeMarketState(symbol, { persist: true });
  if (!result) {
    return NextResponse.json(
      {
        error: "Analysis unavailable",
        detail: "Run the collector until this market has snapshots, then try again."
      },
      { status: 404 }
    );
  }

  return NextResponse.json(jsonSafePublic(result));
}

import { NextResponse } from "next/server";
import { timelineForSymbol } from "@/lib/similarity";
import { jsonSafePublic } from "@/lib/json";

type Params = {
  params: Promise<{ symbol: string }>;
};

export async function GET(request: Request, { params }: Params) {
  const { symbol } = await params;
  const { searchParams } = new URL(request.url);
  const range = normalizeRange(searchParams.get("range"));
  const result = await timelineForSymbol(symbol, range);
  if (!result) return NextResponse.json({ error: "Timeline unavailable" }, { status: 404 });
  return NextResponse.json(jsonSafePublic(result));
}

function normalizeRange(value: string | null) {
  if (value === "1h" || value === "4h" || value === "24h" || value === "7d") return value;
  return "24h";
}

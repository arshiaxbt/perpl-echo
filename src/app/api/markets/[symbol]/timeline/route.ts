import { NextResponse } from "next/server";
import { timelineForSymbol } from "@/lib/similarity";
import { jsonSafePublic } from "@/lib/json";

type Params = {
  params: Promise<{ symbol: string }>;
};

export async function GET(request: Request, { params }: Params) {
  const { symbol } = await params;
  const { searchParams } = new URL(request.url);
  const result = await timelineForSymbol(symbol, searchParams.get("range") ?? "24h");
  if (!result) return NextResponse.json({ error: "Timeline unavailable" }, { status: 404 });
  return NextResponse.json(jsonSafePublic(result));
}

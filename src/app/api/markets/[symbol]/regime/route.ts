import { NextResponse } from "next/server";
import { regimeForSymbol } from "@/lib/similarity";
import { jsonSafePublic } from "@/lib/json";

type Params = {
  params: Promise<{ symbol: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const { symbol } = await params;
  const result = await regimeForSymbol(symbol);
  if (!result) return NextResponse.json({ error: "Market regime unavailable" }, { status: 404 });
  return NextResponse.json(jsonSafePublic(result));
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonSafePublic } from "@/lib/json";

type Params = {
  params: Promise<{ analysisHash: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const { analysisHash } = await params;
  const searches = await prisma.similaritySearch.findMany({
    orderBy: { createdAt: "desc" },
    take: 250
  });
  const found = searches.find((search) => {
    const result = search.resultsJson as { analysisHash?: string } | null;
    return result?.analysisHash === analysisHash;
  });
  if (!found) return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  return NextResponse.json(jsonSafePublic(found.resultsJson));
}

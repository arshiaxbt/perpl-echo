import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { jsonSafePublic } from "@/lib/json";
import { LocalTime } from "@/components/local-time";
import { Metric } from "@/components/metric";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { num, pct } from "@/lib/utils";

type Params = {
  params: Promise<{ analysisHash: string }>;
};

type StoredAnalysis = {
  analysisHash: string;
  market: { symbol: string };
  current: {
    timestamp: string | Date;
    price: number;
    fundingRate: number;
    fundingApr: number;
  };
  regime?: { name: string };
  marketMemory?: { nearestClusterName?: string | null; rarityScore?: number | null };
  echoConfidence?: { confidenceScore: number; confidenceLabel: string };
};

export const dynamic = "force-dynamic";

export default async function AnalysisHashPage({ params }: Params) {
  const { analysisHash } = await params;
  const searches = await prisma.similaritySearch.findMany({ orderBy: { createdAt: "desc" }, take: 250 });
  const found = searches.find((search) => {
    const result = search.resultsJson as { analysisHash?: string } | null;
    return result?.analysisHash === analysisHash;
  });
  if (!found) notFound();

  const analysis = jsonSafePublic(found.resultsJson) as StoredAnalysis;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost">
        <Link href="/bookmarks">
          <ArrowLeft className="h-4 w-4" />
          Bookmarks
        </Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>Saved Echo</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Metric label="Market" value={analysis.market.symbol} />
          <Metric label="Snapshot Time" value={<LocalTime value={analysis.current.timestamp} />} />
          <Metric label="Price" value={`$${num(analysis.current.price, 2)}`} />
          <Metric label="Funding" value={pct(analysis.current.fundingRate * 100, 4)} />
          <Metric label="APR" value={pct(analysis.current.fundingApr, 2)} />
          <Metric label="Regime" value={analysis.regime?.name?.replaceAll("_", " ") ?? "Unavailable"} />
          <Metric label="Cluster" value={analysis.marketMemory?.nearestClusterName ?? "Unavailable"} />
          <Metric label="Rarity" value={analysis.marketMemory?.rarityScore !== null ? `${num(analysis.marketMemory?.rarityScore, 1)}/100` : "Unavailable"} />
          <Metric label="Echo Confidence" value={analysis.echoConfidence ? `${num(analysis.echoConfidence.confidenceScore, 1)} (${analysis.echoConfidence.confidenceLabel})` : "Unavailable"} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>State Identity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="break-all font-mono text-xs text-muted-foreground">{analysisHash}</div>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Not financial advice. Historical similarity does not guarantee future outcomes.
      </p>
    </div>
  );
}

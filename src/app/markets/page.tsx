import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AnalysisButton } from "@/components/analysis-button";
import { LiveRefresh } from "@/components/live-refresh";
import { Metric } from "@/components/metric";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DATA_QUALITY_THRESHOLDS, snapshotFreshnessStatus } from "@/lib/data-quality";
import { fundingPercentile, rarityLabel, rarityScore } from "@/lib/metrics";
import { prisma } from "@/lib/prisma";
import { num, pct } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MarketsPage() {
  const markets = await prisma.market.findMany({
    where: { active: true },
    include: {
      snapshots: {
        orderBy: { timestamp: "desc" },
        take: 1
      }
    },
    orderBy: { symbol: "asc" }
  });

  const latestSnapshot = await prisma.marketSnapshot.findFirst({
    orderBy: { timestamp: "desc" },
    select: { timestamp: true }
  });
  const freshness = snapshotFreshnessStatus(latestSnapshot?.timestamp ?? null);

  const rows = await Promise.all(
    markets.map(async (market) => {
      const latest = market.snapshots[0] ?? null;
      const rateRows = await prisma.marketSnapshot.findMany({
        where: { marketId: market.id },
        select: { fundingRate: true, timestamp: true },
        orderBy: { timestamp: "desc" },
        take: 5000
      });
      const oldest = rateRows[rateRows.length - 1]?.timestamp ?? null;
      const historyHours = latest && oldest ? (latest.timestamp.getTime() - oldest.getTime()) / 3_600_000 : 0;
      const percentile =
        latest && historyHours >= DATA_QUALITY_THRESHOLDS.rarityHistoryHours
          ? fundingPercentile(latest.fundingRate, rateRows.map((row) => row.fundingRate))
          : null;
      return { market, latest, percentile, historyHours };
    })
  );

  return (
    <div className="space-y-6">
      <LiveRefresh />
      <section className="space-y-3">
        <Badge className="border-primary/40 bg-primary/10 text-primary">Live markets</Badge>
        <h1 className="text-4xl font-semibold leading-none md:text-5xl">Markets</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Current Perpl market states from the latest worker snapshots.
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Markets Tracked" value={`${markets.length}`} />
        <Metric
          label="Latest Snapshot Age"
          value={freshness.ageMinutes === null ? "No snapshots" : `${num(freshness.ageMinutes, 1)} min`}
        />
        <Metric label="Snapshot Status" value={freshness.stale ? "stale" : "fresh"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Market States</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="rounded-sm border border-dashed p-6 text-sm text-muted-foreground">
              No markets have been collected yet. Start the worker and check `/api/worker-status`.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Market</TH>
                    <TH>Funding</TH>
                    <TH>APR</TH>
                    <TH>24h Return</TH>
                    <TH>History</TH>
                    <TH>Rarity</TH>
                    <TH className="text-right">Action</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map(({ market, latest, percentile, historyHours }) => (
                    <TR key={market.id}>
                      <TD>
                        <Link href={`/markets/${market.symbol}`} className="flex items-center gap-2 font-semibold">
                          {market.symbol}
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {market.baseAsset}/{market.quoteAsset}
                        </div>
                      </TD>
                      <TD>{latest ? pct(latest.fundingRate * 100, 4) : "Collecting"}</TD>
                      <TD>{latest ? pct(latest.fundingApr, 2) : "Collecting"}</TD>
                      <TD>{latest ? pct(latest.return24hBefore, 2) : "Collecting"}</TD>
                      <TD>{num(historyHours, 1)}h</TD>
                      <TD>
                        <div className="font-medium">{rarityLabel(percentile)}</div>
                        {rarityScore(percentile) !== null ? (
                          <div className="text-xs text-muted-foreground">{num(rarityScore(percentile), 1)}/100</div>
                        ) : null}
                      </TD>
                      <TD className="text-right">
                        <AnalysisButton symbol={market.symbol} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Not financial advice. Historical similarity does not guarantee future outcomes.
      </p>
    </div>
  );
}

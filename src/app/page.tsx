import Link from "next/link";
import { ArrowRight, Database, Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { fundingPercentile, rarityLabel, rarityScore } from "@/lib/metrics";
import { num, pct } from "@/lib/utils";
import { AnalysisButton } from "@/components/analysis-button";
import { BrandLogo } from "@/components/brand-logo";
import { LiveRefresh } from "@/components/live-refresh";
import { LocalTime } from "@/components/local-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DATA_QUALITY_THRESHOLDS, snapshotFreshnessStatus } from "@/lib/data-quality";

export const dynamic = "force-dynamic";

export default async function HomePage() {
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
  const [snapshotCount, latestSnapshot, latestWorkerRun] = await Promise.all([
    prisma.marketSnapshot.count(),
    prisma.marketSnapshot.findFirst({ orderBy: { timestamp: "desc" }, select: { timestamp: true } }),
    prisma.workerRun.findFirst({ where: { status: "success" }, orderBy: { startedAt: "desc" } })
  ]);
  const freshness = snapshotFreshnessStatus(latestSnapshot?.timestamp ?? null);
  const oldestSnapshot = await prisma.marketSnapshot.findFirst({ orderBy: { timestamp: "asc" }, select: { timestamp: true } });
  const historyHours =
    oldestSnapshot && latestSnapshot
      ? Math.max(0, (latestSnapshot.timestamp.getTime() - oldestSnapshot.timestamp.getTime()) / 3_600_000)
      : 0;
  const dataQualityLabel =
    historyHours >= DATA_QUALITY_THRESHOLDS.rarityHistoryHours && snapshotCount >= DATA_QUALITY_THRESHOLDS.confidenceSnapshots
      ? "Analysis ready"
      : "Collecting history";

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
      const marketHistoryHours = latest && oldest ? (latest.timestamp.getTime() - oldest.getTime()) / 3_600_000 : 0;
      const percentile =
        latest && marketHistoryHours >= DATA_QUALITY_THRESHOLDS.rarityHistoryHours
          ? fundingPercentile(latest.fundingRate, rateRows.map((row) => row.fundingRate))
          : null;
      return { market, latest, percentile };
    })
  );

  return (
    <div className="space-y-6">
      <LiveRefresh />
      <section className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-3">
          <Badge className="border-primary/40 bg-primary/10 text-primary">Monad native Perpl market memory</Badge>
          <h1 className="max-w-4xl text-4xl font-semibold leading-[0.95] tracking-normal md:text-6xl">
            Perpl Echo
          </h1>
          <p className="max-w-3xl text-lg leading-7 text-foreground/86 md:text-2xl">
            Historical market intelligence for Perpl.
          </p>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Perpl Echo helps traders compare the current Perpl market state with similar historical states, understand
            market regimes, and see what usually happened next.
          </p>
          <div className="grid max-w-3xl gap-2 pt-3 sm:grid-cols-3">
            <div className="border border-border bg-background/55 p-4">
              <div className="text-sm font-semibold">1. Pick a market</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">Start with BTC, ETH, MON, SOL, or another active Perpl market.</div>
            </div>
            <div className="border border-border bg-background/55 p-4">
              <div className="text-sm font-semibold">2. Open Analyze</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">See similar past states, market regime, and average historical outcomes.</div>
            </div>
            <div className="border border-border bg-background/55 p-4">
              <div className="text-sm font-semibold">3. Check evidence</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">Use sample size and confidence to judge whether the history is strong enough.</div>
            </div>
          </div>
          <div className="grid max-w-3xl gap-2 pt-3 sm:grid-cols-2">
            <div className="border border-border bg-background/55 p-4">
              <div className="text-2xl font-semibold">5m</div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Snapshot cadence
              </div>
            </div>
            <div className="border border-border bg-background/55 p-4">
              <div className="text-2xl font-semibold">10</div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Historical matches
              </div>
            </div>
          </div>
        </div>
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Network Pulse</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex h-20 items-center justify-center border border-primary/20 bg-primary/10 text-primary">
              <BrandLogo className="h-12 w-12" imageClassName="drop-shadow-[0_0_18px_hsl(var(--primary)/0.35)]" priority />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Markets tracked</span>
              <span className="font-semibold">{markets.length}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Latest state</span>
              <span className="text-right text-sm font-medium">
                <LocalTime value={rows.find((row) => row.latest)?.latest?.timestamp} />
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Data quality</span>
              <span className="text-right text-sm font-medium">{dataQualityLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">History collected</span>
              <span className="text-right text-sm font-medium">{num(historyHours, 1)}h</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Latest snapshot age</span>
              <span className="text-right text-sm font-medium">
                {freshness.ageMinutes === null ? "No snapshots" : `${num(freshness.ageMinutes, 1)} min`}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Worker health</span>
              <span className="text-right text-sm font-medium">{latestWorkerRun ? "running" : "not started"}</span>
            </div>
            <Button asChild variant="secondary" className="w-full">
              <Link href="/status">
                <Database className="h-4 w-4" />
                Data Status
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Markets</CardTitle>
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            Choose a market and click Analyze. The first card gives the plain-English read; detailed metrics stay available on the market page.
          </p>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="rounded-sm border border-dashed p-6 text-sm text-muted-foreground">
              No markets have been collected yet. Start Postgres, run migrations, then run `npm run worker:once` or use
              the background worker.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Market</TH>
                    <TH>Current Funding</TH>
                    <TH>Funding APR</TH>
                    <TH>24h Price Change</TH>
                    <TH>Funding Rarity</TH>
                    <TH className="text-right">Action</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map(({ market, latest, percentile }) => (
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
                      <TD>
                        <div className="font-medium">{rarityLabel(percentile)}</div>
                        {rarityScore(percentile) !== null ? (
                          <div className="text-xs text-muted-foreground">{num(rarityScore(percentile), 1)}</div>
                        ) : null}
                      </TD>
                      <TD className="text-right">
                        <div className="flex justify-end">
                          <AnalysisButton symbol={market.symbol} />
                        </div>
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

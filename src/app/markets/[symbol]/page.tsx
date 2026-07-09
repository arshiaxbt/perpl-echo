import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, GitBranch, History, Network } from "lucide-react";
import { AnalysisButton } from "@/components/analysis-button";
import { BrandLogo } from "@/components/brand-logo";
import { EchoActions } from "@/components/echo/echo-actions";
import { LiveRefresh } from "@/components/live-refresh";
import { LocalTime } from "@/components/local-time";
import { Metric } from "@/components/metric";
import { OutcomeChart } from "@/components/outcome-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { analyzeMarketState } from "@/lib/similarity";
import { num, pct } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ symbol: string }>;
};

export default async function MarketPage({ params }: Params) {
  const { symbol } = await params;
  const market = await prisma.market.findUnique({
    where: { symbol: symbol.toUpperCase() },
    select: { symbol: true }
  });

  if (!market) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <LiveRefresh />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            Markets
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link href={`/markets/${market.symbol}/timeline`}>
              <History className="h-4 w-4" />
              Timeline
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href={`/markets/${market.symbol}/graph`}>
              <GitBranch className="h-4 w-4" />
              State Graph
            </Link>
          </Button>
          <AnalysisButton symbol={market.symbol} />
        </div>
      </div>

      <Suspense fallback={<MarketAnalysisFallback symbol={market.symbol} />}>
        <MarketAnalysis symbol={market.symbol} />
      </Suspense>

      <p className="text-xs text-muted-foreground">
        Not financial advice. Historical similarity does not guarantee future outcomes.
      </p>
    </div>
  );
}

function MarketAnalysisFallback({ symbol }: { symbol: string }) {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Badge className="mb-3 border-primary/40 bg-primary/10 text-primary">Echo state</Badge>
                <h1 className="text-3xl font-semibold leading-none md:text-5xl">{symbol}</h1>
              </div>
              <Badge className="border-border text-muted-foreground">Loading</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, index) => (
              <div key={index} className="h-20 animate-pulse rounded-sm border border-border bg-muted/35" />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Average Outcome</CardTitle>
              <BrandLogo className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="h-40 animate-pulse rounded-sm border border-border bg-muted/35" />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="h-20 animate-pulse rounded-sm border border-border bg-muted/35" />
              <div className="h-20 animate-pulse rounded-sm border border-border bg-muted/35" />
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Historical Echo Matches</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-10 animate-pulse rounded-sm border border-border bg-muted/35" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

async function MarketAnalysis({ symbol }: { symbol: string }) {
  const result = await analyzeMarketState(symbol);

  if (!result) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Market Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-sm border border-dashed p-6 text-sm text-muted-foreground">
            Market analysis is unavailable until the worker has collected snapshots for this market.
          </div>
        </CardContent>
      </Card>
    );
  }

  const current = result.current;
  const quality = result.dataQuality;
  const onchain = result.onchainIntelligence;
  const average = result.averageOutcome;
  const cluster = result.currentCluster?.cluster ?? null;
  const evolutionTransitions = result.evolution?.transitions ?? [];
  const crossMarketRows = result.crossMarket?.rows?.filter((row) => row.sampleSize > 0).slice(0, 8) ?? [];
  const chartData = [
    { label: "1h", value: average.return1h },
    { label: "4h", value: average.return4h },
    { label: "24h", value: average.return24h }
  ];
  const hasFundingOutcome = average.fundingNormalizedRate !== null;
  const hasSpread = current.spread !== null;
  const hasOpenInterest = current.openInterest !== null;
  const onchainMetrics = [
    { label: "Recent Events", value: onchain ? `${onchain.recentEventCount}` : null },
    { label: "Latest Block", value: onchain ? onchain.blockNumber.toString() : null },
    { label: "Active Wallets", value: onchain?.uniqueWalletCount === null || !onchain ? null : `${onchain.uniqueWalletCount}` },
    {
      label: "New / Returning",
      value:
        onchain?.newWalletCount === null || onchain?.returningWalletCount === null || !onchain
          ? null
          : `${onchain.newWalletCount} / ${onchain.returningWalletCount}`
    },
    { label: "Whale Activity", value: onchain?.whaleActivityScore === null || !onchain ? null : num(onchain.whaleActivityScore, 1) },
    { label: "Event Velocity", value: onchain?.eventVelocity === null || !onchain ? null : `${num(onchain.eventVelocity, 2)}/min` },
    {
      label: "Wallet Concentration",
      value: onchain?.walletConcentrationScore === null || !onchain ? null : pct(onchain.walletConcentrationScore, 1)
    },
    { label: "Unknown Events", value: onchain?.unknownEventCount === null || !onchain ? null : `${onchain.unknownEventCount}` }
  ].filter((metric): metric is { label: string; value: string } => metric.value !== null);

  return (
    <>
      <section className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Badge className="mb-3 border-primary/40 bg-primary/10 text-primary">Echo state</Badge>
                <h1 className="text-3xl font-semibold leading-none md:text-5xl">{result.market.symbol}</h1>
              </div>
              <Badge className="border-primary/40 text-primary">{result.rarityLabel}</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Metric label="Mark Price" value={`$${num(current.price, 2)}`} />
            <Metric label="Funding" value={pct(current.fundingRate * 100, 4)} tone="warn" />
            <Metric label="APR" value={pct(current.fundingApr, 2)} tone="warn" />
            {result.fundingPercentile !== null ? <Metric label="Funding Percentile" value={pct(result.fundingPercentile, 1)} /> : null}
            <Metric label="Volatility (24h ann.)" value={pct(current.volatility, 2)} />
            {result.rarityScore !== null ? <Metric label="State Rarity" value={`${num(result.rarityScore, 1)}/100`} /> : null}
            {hasSpread ? <Metric label="Spread (%)" value={pct(current.spread, 4)} /> : null}
            {hasOpenInterest ? <Metric label="Open Interest (contracts)" value={num(current.openInterest, 2)} /> : null}
            <Metric label="24h Return Before" value={pct(current.return24hBefore, 2)} />
            <Metric label="History Collected" value={`${num(quality.historyCoverage.historyHours, 1)}h`} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Average Outcome</CardTitle>
              <BrandLogo className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {quality.analysisReadiness.hiddenMetrics.averageOutcome ? (
              <div className="rounded-sm border border-dashed p-6 text-sm text-muted-foreground">
                {quality.analysisReadiness.reasons.find((reason) => reason.includes("historical matches")) ??
                  "Collecting enough historical outcomes before average outcome is shown."}
              </div>
            ) : (
              <>
                <OutcomeChart data={chartData} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Metric label="Sample Size" value={`${result.matches.length} top matches`} />
                  {hasFundingOutcome ? <Metric label="Funding Normalized Within 8h" value={pct(average.fundingNormalizedRate, 0)} /> : null}
                  <Metric label="Average Max Upside" value={pct(average.maxUpside, 2)} tone="good" />
                  <Metric label="Average Max Downside" value={pct(average.maxDownside, 2)} tone="bad" />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Echo Confidence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Metric
                label="Evidence Confidence"
                value={result.echoConfidence.confidenceScore === null ? "Insufficient evidence" : `${num(result.echoConfidence.confidenceScore, 1)}/100`}
              />
              <Metric label="Label" value={result.echoConfidence.confidenceLabel.replaceAll("_", " ")} />
            </div>
            <div className="rounded-sm border border-border bg-muted/35 p-3 text-sm text-muted-foreground">
              Confidence in historical evidence, not future prediction.
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {result.echoConfidence.confidenceReasonsJson.map((reason) => (
                <li key={reason}>- {reason}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Current Regime</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Metric label="Regime" value={result.regime.name.replaceAll("_", " ")} />
              <Metric label="Confidence" value={pct(result.regime.confidence * 100, 0)} />
              {quality.analysisReadiness.hiddenMetrics.regimeStatistics ? null : (
                <Metric label="Same-Regime Sample" value={`${result.regime.sampleSize}`} />
              )}
            </div>
            {quality.analysisReadiness.hiddenMetrics.regimeStatistics ? (
              <div className="rounded-sm border border-dashed p-3 text-sm text-muted-foreground">
                {quality.regimeCoverage.reason}
              </div>
            ) : null}
            {result.regime.warning ? (
              <div className="rounded-sm border border-accent/40 bg-accent/10 p-3 text-sm text-accent">{result.regime.warning}</div>
            ) : null}
            {result.regime.reasons.length ? (
              <ul className="space-y-2 text-sm text-muted-foreground">
                {result.regime.reasons.map((reason) => (
                  <li key={reason}>- {reason}</li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Market Memory</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {quality.analysisReadiness.hiddenMetrics.marketMemory ? (
              <div className="rounded-sm border border-dashed p-6 text-sm text-muted-foreground sm:col-span-2">
                {result.marketMemory.reason ?? "Collecting enough history before market memory is shown."}
              </div>
            ) : (
              <>
                <Metric label="Rarity Score" value={`${num(result.marketMemory.rarityScore, 1)}/100`} />
                <Metric label="Cluster Name" value={result.marketMemory.nearestClusterName} />
                <Metric label="Historical Frequency" value={pct(result.marketMemory.historicalFrequencyPercent, 2)} />
                <Metric label="Sample Size" value={`${result.marketMemory.sampleSize}`} />
                {result.marketMemory.lastSimilarStateAt ? (
                  <Metric label="Last Seen" value={<LocalTime value={result.marketMemory.lastSimilarStateAt} />} />
                ) : null}
                {result.marketMemory.stateAgeDays !== null ? (
                  <Metric label="State Age" value={`${num(result.marketMemory.stateAgeDays, 1)} days`} />
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Current Cluster</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {cluster && !quality.analysisReadiness.hiddenMetrics.clusterOutcomes ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Metric label="Cluster" value={cluster.name} />
                  <Metric label="Sample Size" value={`${cluster.sampleSize}`} />
                  <Metric label="Typical 1h Outcome" value={pct(cluster.averageReturn1h, 2)} />
                  <Metric label="Typical 4h Outcome" value={pct(cluster.averageReturn4h, 2)} />
                  <Metric label="Typical 24h Outcome" value={pct(cluster.averageReturn24h, 2)} />
                  <Metric label="Funding Normalization" value={pct(cluster.fundingNormalizationRate, 0)} />
                </div>
                {cluster.description ? <div className="text-sm text-muted-foreground">{cluster.description}</div> : null}
              </>
            ) : (
              <div className="rounded-sm border border-dashed p-6 text-sm text-muted-foreground">
                {cluster
                  ? "Cluster assignment exists, but typical outcomes need more historical samples."
                  : "Cluster assignment will appear after the worker processes this market history."}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>What Usually Happens Next?</CardTitle>
          </CardHeader>
          <CardContent>
            {evolutionTransitions.length ? (
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <TR>
                      <TH>Historically Transitioned To</TH>
                      <TH>Probability</TH>
                      <TH>Avg Time</TH>
                      <TH>Avg Return</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {evolutionTransitions.slice(0, 5).map((transition) => (
                      <TR key={transition.id}>
                        <TD>{transition.toCluster.name}</TD>
                        <TD>{pct(transition.probability * 100, 0)}</TD>
                        <TD>{transition.averageMinutesToTransition === null ? "Unavailable" : `${num(transition.averageMinutesToTransition, 0)} min`}</TD>
                        <TD>{pct(transition.averageReturnDuringTransition, 2)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            ) : (
              <div className="rounded-sm border border-dashed p-6 text-sm text-muted-foreground">
                More clustered history is needed before transition probabilities appear.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Cross-Market Echo</CardTitle>
              <Network className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            {crossMarketRows.length ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Metric label="Strongest Positive Co-mover" value={result.crossMarket?.strongestPositive?.market ?? "Unavailable"} />
                  <Metric label="Strongest Negative Co-mover" value={result.crossMarket?.strongestNegative?.market ?? "Unavailable"} />
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Market</TH>
                        <TH>1h</TH>
                        <TH>4h</TH>
                        <TH>24h</TH>
                        <TH>Samples</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {crossMarketRows.map((row) => (
                        <TR key={row.market}>
                          <TD>{row.market}</TD>
                          <TD>{pct(row.averageReturn1h, 2)}</TD>
                          <TD>{pct(row.averageReturn4h, 2)}</TD>
                          <TD>{pct(row.averageReturn24h, 2)}</TD>
                          <TD>{row.sampleSize}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              </div>
            ) : (
              <div className="rounded-sm border border-dashed p-6 text-sm text-muted-foreground">
                Cross-market outcomes need overlapping historical snapshots across multiple markets.
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>On-chain Intelligence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {onchainMetrics.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {onchainMetrics.map((metric) => (
                  <Metric key={metric.label} label={metric.label} value={metric.value} />
                ))}
              </div>
            ) : (
              <div className="rounded-sm border border-dashed p-6 text-sm text-muted-foreground">
                On-chain intelligence will appear after the Monad indexer has enough raw events.
              </div>
            )}
            {onchain?.unknownEventCount ? (
              <div className="rounded-sm border border-border bg-muted/35 p-3 text-sm text-muted-foreground">
                Unknown events are included because exact Perpl ABI decoding is incomplete.
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bookmark / Echo Consensus</CardTitle>
          </CardHeader>
          <CardContent>
            <EchoActions
              symbol={result.market.symbol}
              timestamp={current.timestamp.toISOString()}
              clusterName={cluster?.name ?? null}
              regime={result.regime.name}
              echoScore={result.matches[0]?.echoScore ?? null}
              rarityScore={result.rarityScore}
              currentPrice={current.price}
              fundingRate={current.fundingRate}
              fundingApr={current.fundingApr}
              analysisHash={result.analysisHash}
            />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Historical Echo Matches</CardTitle>
        </CardHeader>
        <CardContent>
          {result.matches.length === 0 ? (
            <div className="rounded-sm border border-dashed p-6 text-sm text-muted-foreground">
              Not enough 24h-old snapshots with forward outcomes yet. Keep the collector running.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Timestamp</TH>
                    <TH>Echo Score</TH>
                    <TH>Similarity</TH>
                    <TH>Why This Matched</TH>
                    <TH>1h</TH>
                    <TH>4h</TH>
                    <TH>24h</TH>
                    <TH>Max Up / Down</TH>
                  </TR>
                </THead>
                <TBody>
                  {result.matches.map((match) => (
                    <TR key={match.snapshot.id}>
                      <TD className="whitespace-nowrap"><LocalTime value={match.snapshot.timestamp} /></TD>
                      <TD>{num(match.echoScore, 1)}</TD>
                      <TD>{pct(match.similarity * 100, 0)}</TD>
                      <TD className="min-w-[260px] text-xs text-muted-foreground">
                        <details>
                          <summary className="cursor-pointer text-foreground">Score breakdown</summary>
                          <div className="mt-2 grid gap-1">
                            <span>Regime {num(match.echoBreakdown?.regimeScore, 0)}</span>
                            <span>Funding {num(match.echoBreakdown?.fundingScore, 0)}</span>
                            <span>Structure {num(match.echoBreakdown?.structureScore, 0)}</span>
                            <span>On-chain {num(match.echoBreakdown?.onchainScore, 0)}</span>
                            <span>Temporal {num(match.echoBreakdown?.temporalScore, 0)}</span>
                            <span>Rarity {num(match.echoBreakdown?.rarityScore, 0)}</span>
                            {match.echoBreakdown?.explanationJson?.map((reason) => (
                              <span key={reason}>- {reason}</span>
                            ))}
                          </div>
                        </details>
                      </TD>
                      <TD>{pct(match.outcome?.return1h, 2)}</TD>
                      <TD>{pct(match.outcome?.return4h, 2)}</TD>
                      <TD>{pct(match.outcome?.return24h, 2)}</TD>
                      <TD>
                        {pct(match.outcome?.maxUpside, 2)} / {pct(match.outcome?.maxDownside, 2)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { stateGraphForMarket } from "@/lib/cluster-service";
import { Metric } from "@/components/metric";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { num, pct } from "@/lib/utils";

type Params = {
  params: Promise<{ symbol: string }>;
};

export const dynamic = "force-dynamic";

export default async function MarketGraphPage({ params }: Params) {
  const { symbol } = await params;
  const graph = await stateGraphForMarket(symbol);
  if (!graph) notFound();

  const current = graph.nodes.find((node) => node.id === graph.currentNodeId) ?? graph.nodes[0] ?? null;
  const outgoing = graph.edges
    .filter((edge) => edge.source === graph.currentNodeId)
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost">
        <Link href={`/markets/${graph.market.symbol}`}>
          <ArrowLeft className="h-4 w-4" />
          {graph.market.symbol}
        </Link>
      </Button>
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold md:text-5xl">{graph.market.symbol} State Graph</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Historical transitions between recurring market state clusters. Edges show how often a cluster historically transitioned to another cluster.
        </p>
      </div>

      <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Current Cluster</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <Metric label="Name" value={current?.name ?? "Unavailable"} />
            <Metric label="Regime" value={current?.regime.replaceAll("_", " ") ?? "Unavailable"} />
            <Metric label="Sample Size" value={current ? `${current.sampleSize}` : "Unavailable"} />
            <Metric label="Average 4h Outcome" value={pct(current?.averageReturn4h, 2)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Connected Next Clusters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="min-h-[260px] overflow-x-auto">
              <svg viewBox="0 0 760 260" className="h-[260px] min-w-[760px]">
                <rect x="20" y="92" width="210" height="76" rx="4" className="fill-primary/15 stroke-primary/60" />
                <text x="36" y="122" className="fill-foreground text-sm font-semibold">{trimLabel(current?.name ?? "Current")}</text>
                <text x="36" y="148" className="fill-muted-foreground text-xs">{current?.regime.replaceAll("_", " ") ?? ""}</text>
                {outgoing.map((edge, index) => {
                  const target = graph.nodes.find((node) => node.id === edge.target);
                  const y = 20 + index * 30;
                  return (
                    <g key={`${edge.source}-${edge.target}`}>
                      <line x1="230" y1="130" x2="420" y2={y + 14} className="stroke-border" strokeWidth="2" />
                      <text x="300" y={(130 + y + 14) / 2 - 4} className="fill-primary text-[10px]">{pct(edge.probability * 100, 0)}</text>
                      <rect x="420" y={y} width="300" height="24" rx="3" className="fill-card stroke-border" />
                      <text x="432" y={y + 16} className="fill-foreground text-xs">{trimLabel(target?.name ?? "Unknown", 34)}</text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Transition Table</CardTitle>
        </CardHeader>
        <CardContent>
          {outgoing.length === 0 ? (
            <div className="rounded-sm border border-dashed p-6 text-sm text-muted-foreground">
              More clustered history is needed before transition edges appear.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Historically Transitioned To</TH>
                    <TH>Probability</TH>
                    <TH>Count</TH>
                    <TH>Average Time</TH>
                    <TH>Average Return</TH>
                  </TR>
                </THead>
                <TBody>
                  {outgoing.map((edge) => {
                    const target = graph.nodes.find((node) => node.id === edge.target);
                    return (
                      <TR key={`${edge.source}-${edge.target}`}>
                        <TD>{target?.name ?? edge.target}</TD>
                        <TD>{pct(edge.probability * 100, 0)}</TD>
                        <TD>{edge.transitionCount}</TD>
                        <TD>{edge.averageMinutesToTransition === null ? "Unavailable" : `${num(edge.averageMinutesToTransition, 0)} min`}</TD>
                        <TD>{pct(edge.averageReturnDuringTransition, 2)}</TD>
                      </TR>
                    );
                  })}
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

function trimLabel(value: string, max = 24) {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

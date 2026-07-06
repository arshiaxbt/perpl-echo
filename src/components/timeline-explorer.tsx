"use client";

import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LocalTime } from "@/components/local-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Metric } from "@/components/metric";
import { num, pct } from "@/lib/utils";

type TimelineSnapshot = {
  id: string;
  timestamp: string;
  price: number;
  fundingRate: number;
  fundingApr: number;
  regime: string | null;
  regimeConfidence: number | null;
  volatility: number;
  volume: number;
  return24hBefore: number;
  onchainIntelligence?: {
    recentEventCount: number;
    uniqueWalletCount: number | null;
    whaleActivityScore: number | null;
    eventVelocity: number | null;
    blockNumber: string;
  } | null;
};

type AnalyzeAt = {
  matches: Array<{
    snapshot: TimelineSnapshot;
    similarity: number;
    outcome: {
      return1h: number | null;
      return4h: number | null;
      return24h: number | null;
    } | null;
  }>;
};

const ranges = ["1h", "4h", "24h", "7d"];

export function TimelineExplorer({ symbol }: { symbol: string }) {
  const [range, setRange] = useState("24h");
  const [snapshots, setSnapshots] = useState<TimelineSnapshot[]>([]);
  const [index, setIndex] = useState(0);
  const [matches, setMatches] = useState<AnalyzeAt["matches"]>([]);
  const selected = snapshots[index] ?? null;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/markets/${symbol}/timeline?range=${range}`)
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        const rows = data.snapshots ?? [];
        setSnapshots(rows);
        setIndex(Math.max(0, rows.length - 1));
      })
      .catch(() => {
        if (!cancelled) setSnapshots([]);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, range]);

  useEffect(() => {
    if (!selected) {
      setMatches([]);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      fetch(`/api/markets/${symbol}/analyze-at?timestamp=${encodeURIComponent(selected.timestamp)}`, {
        signal: controller.signal
      })
        .then((response) => response.json())
        .then((data: AnalyzeAt) => setMatches(data.matches ?? []))
        .catch(() => setMatches([]));
    }, 350);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [symbol, selected]);

  const chartRows = useMemo(
    () =>
      snapshots.map((snapshot) => ({
        time: new Date(snapshot.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        price: snapshot.price,
        funding: snapshot.fundingRate * 100,
        onchain: snapshot.onchainIntelligence?.recentEventCount ?? null,
        regime: snapshot.regime
      })),
    [snapshots]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {ranges.map((item) => (
          <Button key={item} variant={range === item ? "default" : "secondary"} onClick={() => setRange(item)}>
            {item}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Replay Control</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {snapshots.length ? (
            <>
              <input
                className="w-full accent-primary"
                type="range"
                min={0}
                max={Math.max(0, snapshots.length - 1)}
                value={index}
                onChange={(event) => setIndex(Number(event.target.value))}
              />
              <div className="text-sm text-muted-foreground">
                <LocalTime value={selected?.timestamp} /> · {index + 1} / {snapshots.length}
              </div>
            </>
          ) : (
            <div className="rounded-sm border border-dashed p-6 text-sm text-muted-foreground">
              No snapshots in this range yet.
            </div>
          )}
        </CardContent>
      </Card>

      {selected ? (
        <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Selected State</CardTitle>
                {selected.regime ? <Badge>{selected.regime.replaceAll("_", " ")}</Badge> : null}
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Metric label="Price" value={`$${num(selected.price, 2)}`} />
              <Metric label="Funding" value={pct(selected.fundingRate * 100, 4)} />
              <Metric label="Funding APR" value={pct(selected.fundingApr, 2)} />
              <Metric label="Volatility" value={pct(selected.volatility, 2)} />
              <Metric label="Volume" value={num(selected.volume, 2)} />
              <Metric label="24h Return Before" value={pct(selected.return24hBefore, 2)} />
              {selected.regimeConfidence !== null ? <Metric label="Regime Confidence" value={pct(selected.regimeConfidence * 100, 0)} /> : null}
              {selected.onchainIntelligence?.recentEventCount !== undefined ? (
                <Metric label="On-chain Events" value={`${selected.onchainIntelligence.recentEventCount}`} />
              ) : null}
              {selected.onchainIntelligence?.uniqueWalletCount !== null && selected.onchainIntelligence?.uniqueWalletCount !== undefined ? (
                <Metric label="Active Wallets" value={`${selected.onchainIntelligence.uniqueWalletCount}`} />
              ) : null}
              {selected.onchainIntelligence?.blockNumber ? <Metric label="Latest Block" value={selected.onchainIntelligence.blockNumber} /> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top 3 Similar Past States</CardTitle>
            </CardHeader>
            <CardContent>
              {matches.length ? (
                <Table>
                  <THead>
                    <TR>
                      <TH>Timestamp</TH>
                      <TH>Similarity</TH>
                      <TH>1h</TH>
                      <TH>4h</TH>
                      <TH>24h</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {matches.map((match) => (
                      <TR key={match.snapshot.id}>
                        <TD className="whitespace-nowrap"><LocalTime value={match.snapshot.timestamp} /></TD>
                        <TD>{pct(match.similarity * 100, 0)}</TD>
                        <TD>{pct(match.outcome?.return1h, 2)}</TD>
                        <TD>{pct(match.outcome?.return4h, 2)}</TD>
                        <TD>{pct(match.outcome?.return24h, 2)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : (
                <div className="rounded-sm border border-dashed p-6 text-sm text-muted-foreground">
                  Historical matches are loading or unavailable for this timestamp.
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Price</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="time" tick={{ fill: "rgba(255,255,255,0.58)", fontSize: 12 }} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.58)", fontSize: 12 }} domain={["auto", "auto"]} />
                <Tooltip contentStyle={{ background: "#111111", border: "1px solid rgba(255,255,255,0.16)" }} />
                <Line type="monotone" dataKey="price" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Funding & On-chain Activity</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="time" tick={{ fill: "rgba(255,255,255,0.58)", fontSize: 12 }} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.58)", fontSize: 12 }} />
                <Tooltip contentStyle={{ background: "#111111", border: "1px solid rgba(255,255,255,0.16)" }} />
                <Area type="monotone" dataKey="funding" stroke="hsl(var(--accent))" fill="hsl(var(--accent) / 0.18)" />
                <Line type="monotone" dataKey="onchain" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

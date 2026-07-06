import { prisma } from "@/lib/prisma";
import { getOnchainStatus } from "@/lib/onchain";
import { LiveRefresh } from "@/components/live-refresh";
import { LocalTime } from "@/components/local-time";
import { Metric } from "@/components/metric";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const [snapshotCount, latestSnapshot, markets, runs, onchain, intelligenceCount] = await Promise.all([
    prisma.marketSnapshot.count(),
    prisma.marketSnapshot.findFirst({ orderBy: { timestamp: "desc" } }),
    prisma.market.findMany({ where: { active: true }, orderBy: { symbol: "asc" } }),
    prisma.collectorRun.findMany({ orderBy: { startedAt: "desc" }, take: 10 }),
    getOnchainStatus(),
    prisma.onchainIntelligenceSnapshot.count()
  ]);

  return (
    <div className="space-y-6">
      <LiveRefresh />
      <section>
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Perpl Echo Operations</div>
        <h1 className="text-4xl font-semibold leading-none md:text-5xl">Data Status</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Snapshot collection runs every 5 minutes by default, while the Monad indexer follows raw Perpl contract logs.
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Snapshots Collected" value={`${snapshotCount}`} />
        <Metric label="Latest Snapshot Time" value={<LocalTime value={latestSnapshot?.timestamp} />} />
        <Metric label="Markets Tracked" value={`${markets.length}`} />
        <Metric label="Collector Status" value={runs[0]?.status ?? "not_started"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>On-chain Indexer</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Enabled" value={onchain.enabled ? "enabled" : "disabled"} />
          <Metric label="RPC Connection" value={onchain.rpcConnected ? "connected" : "not connected"} />
          <Metric label="Latest Processed Block" value={onchain.latestProcessedBlock ?? "Not indexed"} />
          <Metric label="Events Indexed" value={`${onchain.eventCount}`} />
          <Metric label="Intelligence Snapshots" value={`${intelligenceCount}`} />
          <div className="rounded-sm border border-border bg-muted/35 p-3 sm:col-span-2 lg:col-span-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Status Message</div>
            <div className="mt-1 text-sm">{onchain.message ?? "Indexer configured."}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Markets Tracked</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {markets.length ? (
              markets.map((market) => (
                <span key={market.id} className="rounded-sm border border-border bg-muted/30 px-3 py-2 text-sm">
                  {market.symbol}
                </span>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">No markets collected yet.</span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Collector Runs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Started</TH>
                  <TH>Finished</TH>
                  <TH>Status</TH>
                  <TH>Markets</TH>
                  <TH>Snapshots</TH>
                  <TH>Message</TH>
                </TR>
              </THead>
              <TBody>
                {runs.map((run) => (
                  <TR key={run.id}>
                    <TD className="whitespace-nowrap"><LocalTime value={run.startedAt} withSeconds /></TD>
                    <TD className="whitespace-nowrap">{run.finishedAt ? <LocalTime value={run.finishedAt} withSeconds /> : "running"}</TD>
                    <TD>{run.status}</TD>
                    <TD>{run.marketsChecked}</TD>
                    <TD>{run.snapshotsSaved}</TD>
                    <TD>{run.message ?? ""}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

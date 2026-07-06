import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { TimelineExplorer } from "@/components/timeline-explorer";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ symbol: string }>;
};

export default async function TimelinePage({ params }: Params) {
  const { symbol } = await params;
  const market = await prisma.market.findUnique({ where: { symbol: symbol.toUpperCase() } });
  if (!market) notFound();

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost">
        <Link href={`/markets/${market.symbol}`}>
          <ArrowLeft className="h-4 w-4" />
          Market analysis
        </Link>
      </Button>
      <section>
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Market Timeline</div>
        <h1 className="text-4xl font-semibold leading-none md:text-5xl">{market.symbol} Replay</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Replay historical snapshots, regimes, funding, and on-chain activity by timestamp.
        </p>
      </section>
      <TimelineExplorer symbol={market.symbol} />
      <p className="text-xs text-muted-foreground">
        Not financial advice. Historical similarity does not guarantee future outcomes.
      </p>
    </div>
  );
}

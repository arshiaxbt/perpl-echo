import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { BarChart3, TrendingDown, TrendingUp, UsersRound } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { pct } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LocalTime } from "@/components/local-time";

export const dynamic = "force-dynamic";

export default async function ProfilesPage() {
  const profiles = await prisma.userProfile.findMany({
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      twitterUsername: true,
      twitterName: true,
      twitterImageUrl: true,
      updatedAt: true,
      votes: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          analysisHash: true,
          symbol: true,
          voteValue: true,
          actualReturnPercent: true,
          actualOutcome: true,
          createdAt: true
        }
      }
    }
  });

  const totalProfiles = profiles.length;
  const totalVotes = profiles.reduce((sum, profile) => sum + profile.votes.length, 0);
  const bullishVotes = profiles.reduce((sum, profile) => sum + profile.votes.filter((vote) => vote.voteValue === "BULLISH").length, 0);
  const bearishVotes = totalVotes - bullishVotes;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-3">
          <Badge className="border-primary/40 bg-primary/10 text-primary">Community Echo</Badge>
          <h1 className="text-3xl font-semibold md:text-5xl">Profiles</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            X profiles that shared a Bullish 4H or Bearish 4H view on a specific Perpl Echo market state.
            Each vote belongs to one analysis snapshot, not permanent market sentiment.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Consensus Activity</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <Stat icon={<UsersRound className="h-4 w-4" />} label="Profiles" value={String(totalProfiles)} />
            <Stat icon={<TrendingUp className="h-4 w-4" />} label="Bullish 4H" value={String(bullishVotes)} />
            <Stat icon={<TrendingDown className="h-4 w-4" />} label="Bearish 4H" value={String(bearishVotes)} />
          </CardContent>
        </Card>
      </section>

      {profiles.length === 0 ? (
        <Card>
          <CardContent className="pt-5">
            <div className="rounded-sm border border-dashed border-border p-6 text-sm text-muted-foreground">
              No X profiles have voted yet. Open a market, sign in with X, then share a Bullish 4H or Bearish 4H view.
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {profiles.map((profile) => {
            const bullish = profile.votes.filter((vote) => vote.voteValue === "BULLISH").length;
            const bearish = profile.votes.filter((vote) => vote.voteValue === "BEARISH").length;
            const total = profile.votes.length;
            const tokens = topTokens(profile.votes);
            return (
              <Card key={profile.id}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      {profile.twitterImageUrl ? (
                        <Image
                          src={profile.twitterImageUrl}
                          alt=""
                          width={44}
                          height={44}
                          className="h-11 w-11 rounded-full border border-border"
                        />
                      ) : (
                        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-muted">
                          <UsersRound className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold">{profile.twitterName ?? profile.twitterUsername ?? "Perpl Echo user"}</div>
                        {profile.twitterUsername ? (
                          <a
                            className="truncate text-xs text-primary hover:text-primary/80"
                            href={`https://x.com/${profile.twitterUsername}`}
                            rel="noreferrer"
                            target="_blank"
                          >
                            @{profile.twitterUsername}
                          </a>
                        ) : null}
                      </div>
                    </div>
                    <Badge>{total} votes</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <VoteBar label="Bullish 4H" value={bullish} total={total} tone="bullish" />
                    <VoteBar label="Bearish 4H" value={bearish} total={total} tone="bearish" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {tokens.length ? tokens.map((token) => <Badge key={token.symbol}>{token.symbol}</Badge>) : <span className="text-xs text-muted-foreground">No token history yet</span>}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      <BarChart3 className="h-4 w-4" />
                      Recent views
                    </div>
                    <div className="space-y-2">
                      {profile.votes.slice(0, 5).map((vote) => (
                        <Link
                          key={vote.id}
                          href={`/analysis/${vote.analysisHash}`}
                          className="flex items-center justify-between gap-3 rounded-sm border border-border bg-background/45 px-3 py-2 text-sm hover:border-primary/45"
                        >
                          <span className="min-w-0">
                            <span className="font-semibold">{vote.symbol}</span>{" "}
                            <span className={vote.voteValue === "BULLISH" ? "text-emerald-300" : "text-red-300"}>
                              {vote.voteValue === "BULLISH" ? "Bullish 4H" : "Bearish 4H"}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            <LocalTime value={vote.createdAt} />
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="rounded-sm border border-border bg-background/45 p-4 text-xs leading-5 text-muted-foreground">
        Echo Consensus is community feedback on historical market states. It is not a prediction market, betting product,
        buy/sell recommendation, or financial advice.
      </div>
      <Button asChild variant="secondary">
        <Link href="/markets">Open Markets</Link>
      </Button>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-sm border border-border bg-background/45 p-3">
      <div className="flex items-center gap-2 text-muted-foreground">{icon}<span className="text-xs">{label}</span></div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function VoteBar({ label, value, total, tone }: { label: string; value: number; total: number; tone: "bullish" | "bearish" }) {
  const percent = total ? (value / total) * 100 : 0;
  return (
    <div className="rounded-sm border border-border bg-background/45 p-3">
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{pct(percent, 0)}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-sm bg-muted">
        <div className={tone === "bullish" ? "h-full bg-emerald-400" : "h-full bg-red-400"} style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

function topTokens(votes: Array<{ symbol: string }>) {
  const counts = new Map<string, number>();
  for (const vote of votes) counts.set(vote.symbol, (counts.get(vote.symbol) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([symbol, count]) => ({ symbol, count }));
}

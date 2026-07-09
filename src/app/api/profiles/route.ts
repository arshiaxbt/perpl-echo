import { NextResponse } from "next/server";
import { jsonSafePublic } from "@/lib/json";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
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
          snapshotTimestamp: true,
          horizonHours: true,
          voteValue: true,
          actualReturnPercent: true,
          actualOutcome: true,
          onchainTxHash: true,
          onchainWalletAddress: true,
          createdAt: true
        }
      }
    }
  });

  return NextResponse.json(jsonSafePublic({ profiles: profiles.map(profileSummary) }));
}

function profileSummary(profile: {
  id: string;
  twitterUsername: string | null;
  twitterName: string | null;
  twitterImageUrl: string | null;
  updatedAt: Date;
  votes: Array<{
    id: string;
    analysisHash: string;
    symbol: string;
    snapshotTimestamp: Date | null;
    horizonHours: number;
    voteValue: string;
    actualReturnPercent: number | null;
    actualOutcome: string | null;
    onchainTxHash: string | null;
    onchainWalletAddress: string | null;
    createdAt: Date;
  }>;
}) {
  const bullishVotes = profile.votes.filter((vote) => vote.voteValue === "BULLISH").length;
  const bearishVotes = profile.votes.filter((vote) => vote.voteValue === "BEARISH").length;
  const tokenCounts = new Map<string, number>();
  for (const vote of profile.votes) tokenCounts.set(vote.symbol, (tokenCounts.get(vote.symbol) ?? 0) + 1);
  const tokens = [...tokenCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([symbol, count]) => ({ symbol, count }));

  return {
    id: profile.id,
    twitterUsername: profile.twitterUsername,
    twitterName: profile.twitterName,
    twitterImageUrl: profile.twitterImageUrl,
    updatedAt: profile.updatedAt,
    bullishVotes,
    bearishVotes,
    totalVotes: profile.votes.length,
    tokens,
    recentVotes: profile.votes.slice(0, 10)
  };
}

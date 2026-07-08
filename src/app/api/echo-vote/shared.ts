import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const consensusSelect = {
  id: true,
  analysisHash: true,
  symbol: true,
  snapshotTimestamp: true,
  horizonHours: true,
  voteValue: true,
  browserId: true,
  walletAddress: true,
  signature: true,
  message: true,
  closedAt: true,
  actualReturnPercent: true,
  actualOutcome: true,
  createdAt: true
} satisfies Prisma.EchoVoteSelect;

type BuildConsensusInput = {
  analysisHash: string;
  symbol?: string | null;
  snapshotTimestamp?: Date | null;
  horizonHours?: number;
};

export async function buildConsensus(input: BuildConsensusInput) {
  const horizonHours = input.horizonHours ?? 4;
  const votes = await prisma.echoVote.findMany({
    where: { analysisHash: input.analysisHash, horizonHours },
    select: consensusSelect,
    orderBy: { createdAt: "asc" }
  });
  const firstVote = votes[0] ?? null;
  const symbol = (input.symbol ?? firstVote?.symbol ?? "").toUpperCase();
  const snapshotTimestamp = input.snapshotTimestamp ?? firstVote?.snapshotTimestamp ?? null;
  const closesAt = snapshotTimestamp ? new Date(snapshotTimestamp.getTime() + horizonHours * 60 * 60 * 1000) : null;
  const open = closesAt ? Date.now() < closesAt.getTime() : true;
  const bullishVotes = votes.filter((vote) => vote.voteValue === "BULLISH").length;
  const bearishVotes = votes.filter((vote) => vote.voteValue === "BEARISH").length;
  const totalVotes = votes.length;
  const bullishPercent = totalVotes ? (bullishVotes / totalVotes) * 100 : 0;
  const bearishPercent = totalVotes ? (bearishVotes / totalVotes) * 100 : 0;
  const actual = !open && symbol && snapshotTimestamp ? await actualOutcome(symbol, snapshotTimestamp, horizonHours) : null;
  const majority = bullishVotes === bearishVotes ? "MIXED" : bullishVotes > bearishVotes ? "BULLISH" : "BEARISH";
  const communityResult =
    !actual || actual.actualOutcome === "FLAT"
      ? actual
        ? "MIXED"
        : null
      : majority === "MIXED"
        ? "MIXED"
        : majority === actual.actualOutcome
          ? "CORRECT"
          : "WRONG";

  if (!open && actual && votes.some((vote) => vote.closedAt === null || vote.actualOutcome === null)) {
    await prisma.echoVote.updateMany({
      where: { analysisHash: input.analysisHash, horizonHours },
      data: {
        closedAt: closesAt,
        actualReturnPercent: actual.actualReturnPercent,
        actualOutcome: actual.actualOutcome
      }
    });
  }

  return {
    analysisHash: input.analysisHash,
    symbol: symbol || null,
    snapshotTimestamp,
    horizonHours,
    closesAt,
    open,
    timeRemainingSeconds: open && closesAt ? Math.max(0, Math.floor((closesAt.getTime() - Date.now()) / 1000)) : 0,
    bullishVotes,
    bearishVotes,
    totalVotes,
    bullishPercent,
    bearishPercent,
    majority,
    actualReturnPercent: actual?.actualReturnPercent ?? firstVote?.actualReturnPercent ?? null,
    actualOutcome: actual?.actualOutcome ?? firstVote?.actualOutcome ?? null,
    communityResult,
    votes
  };
}

async function actualOutcome(symbol: string, snapshotTimestamp: Date, horizonHours: number) {
  const market = await prisma.market.findUnique({ where: { symbol }, select: { id: true } });
  if (!market) return null;
  const target = new Date(snapshotTimestamp.getTime() + horizonHours * 60 * 60 * 1000);
  const toleranceMs = 20 * 60 * 1000;
  const [start, end] = await Promise.all([
    prisma.marketSnapshot.findFirst({
      where: {
        marketId: market.id,
        timestamp: { gte: new Date(snapshotTimestamp.getTime() - toleranceMs), lte: new Date(snapshotTimestamp.getTime() + toleranceMs) }
      },
      orderBy: { timestamp: "asc" },
      select: { price: true, timestamp: true }
    }),
    prisma.marketSnapshot.findFirst({
      where: {
        marketId: market.id,
        timestamp: { gte: new Date(target.getTime() - toleranceMs), lte: new Date(target.getTime() + toleranceMs) }
      },
      orderBy: { timestamp: "asc" },
      select: { price: true, timestamp: true }
    })
  ]);
  if (!start || !end || start.price <= 0) return null;
  const actualReturnPercent = ((end.price - start.price) / start.price) * 100;
  const actualOutcome = Math.abs(actualReturnPercent) < 0.05 ? "FLAT" : actualReturnPercent > 0 ? "BULLISH" : "BEARISH";
  return { actualReturnPercent, actualOutcome, startTimestamp: start.timestamp, endTimestamp: end.timestamp };
}

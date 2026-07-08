import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonSafePublic } from "@/lib/json";
import { buildConsensus, consensusSelect } from "./shared";

const voteSchema = z.object({
  analysisHash: z.string().min(16).max(128),
  symbol: z.string().min(1).max(32),
  snapshotTimestamp: z.string().datetime(),
  horizonHours: z.literal(4).default(4),
  browserId: z.string().min(8).max(128).optional().nullable(),
  walletAddress: z.string().max(80).optional().nullable(),
  voteValue: z.enum(["BULLISH", "BEARISH"]),
  signature: z.string().max(4096).optional().nullable(),
  message: z.string().max(4096).optional().nullable()
});

export async function POST(request: Request) {
  const parsed = voteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid vote payload" }, { status: 400 });
  const snapshotTimestamp = new Date(parsed.data.snapshotTimestamp);
  const closesAt = new Date(snapshotTimestamp.getTime() + parsed.data.horizonHours * 60 * 60 * 1000);
  if (Date.now() >= closesAt.getTime()) {
    return NextResponse.json({ error: "Consensus voting is closed for this market state." }, { status: 409 });
  }

  const identityFilters = [
    parsed.data.browserId ? { browserId: parsed.data.browserId } : undefined,
    parsed.data.walletAddress ? { walletAddress: parsed.data.walletAddress } : undefined
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  const duplicate = identityFilters.length
    ? await prisma.echoVote.findFirst({
        where: {
          analysisHash: parsed.data.analysisHash,
          horizonHours: parsed.data.horizonHours,
          OR: identityFilters
        }
      })
    : null;
  if (duplicate) {
    const consensus = await buildConsensus({
      analysisHash: parsed.data.analysisHash,
      symbol: parsed.data.symbol,
      snapshotTimestamp,
      horizonHours: parsed.data.horizonHours
    });
    return NextResponse.json(jsonSafePublic({ error: "Consensus already recorded for this browser or wallet.", consensus }), { status: 409 });
  }

  const vote = await prisma.echoVote.create({
    select: consensusSelect,
    data: {
      analysisHash: parsed.data.analysisHash,
      symbol: parsed.data.symbol.toUpperCase(),
      snapshotTimestamp,
      horizonHours: parsed.data.horizonHours,
      browserId: parsed.data.browserId ?? null,
      walletAddress: parsed.data.walletAddress ?? null,
      voteValue: parsed.data.voteValue,
      signature: parsed.data.signature ?? null,
      message: parsed.data.message ?? null
    }
  });

  const consensus = await buildConsensus({
    analysisHash: parsed.data.analysisHash,
    symbol: parsed.data.symbol,
    snapshotTimestamp,
    horizonHours: parsed.data.horizonHours
  });
  return NextResponse.json(jsonSafePublic({ vote, consensus }));
}

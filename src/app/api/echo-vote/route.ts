import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { buildAnalysisHash } from "@/lib/analysis-hash";
import { MONAD_MAINNET_CHAIN_ID } from "@/lib/monad-chain";
import { verifyOnchainEchoVote } from "@/lib/onchain-echo-vote";
import { prisma } from "@/lib/prisma";
import { jsonSafePublic } from "@/lib/json";
import { verifyPrivyRequest } from "@/lib/privy-auth";
import { upsertUserProfile } from "@/lib/user-profile";
import { buildConsensus, consensusSelect } from "./shared";

const voteSchema = z.object({
  analysisHash: z.string().min(16).max(128),
  symbol: z.string().min(1).max(32),
  snapshotTimestamp: z.string().datetime(),
  horizonHours: z.literal(4).default(4),
  browserId: z.string().min(8).max(128).optional().nullable(),
  voteValue: z.enum(["BULLISH", "BEARISH"]),
  onchainTxHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  onchainChainId: z.literal(MONAD_MAINNET_CHAIN_ID),
  onchainWalletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  privyUserId: z.string().min(8),
  twitter: z
    .object({
      subject: z.string().optional().nullable(),
      username: z.string().optional().nullable(),
      name: z.string().optional().nullable(),
      profilePictureUrl: z.string().url().optional().nullable()
    })
    .optional()
    .nullable()
});

export async function POST(request: Request) {
  const parsed = voteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid vote payload" }, { status: 400 });
  const snapshotTimestamp = new Date(parsed.data.snapshotTimestamp);
  const closesAt = new Date(snapshotTimestamp.getTime() + parsed.data.horizonHours * 60 * 60 * 1000);
  if (Date.now() >= closesAt.getTime()) {
    return NextResponse.json({ error: "Consensus voting is closed for this market state." }, { status: 409 });
  }

  const verified = await verifyPrivyRequest(request);
  if (!verified || parsed.data.privyUserId !== verified.privyUserId) {
    return NextResponse.json({ error: "Sign in with X before recording an Echo view." }, { status: 401 });
  }

  const symbol = parsed.data.symbol.toUpperCase();
  const market = await prisma.market.findUnique({ where: { symbol }, select: { id: true } });
  const snapshot = market
    ? await prisma.marketSnapshot.findUnique({ where: { marketId_timestamp: { marketId: market.id, timestamp: snapshotTimestamp } } })
    : null;
  if (!snapshot || buildAnalysisHash({ symbol, snapshot }) !== parsed.data.analysisHash) {
    return NextResponse.json({ error: "This Echo does not match a stored market snapshot." }, { status: 400 });
  }

  const profile = await upsertUserProfile({
    privyUserId: verified.privyUserId,
    twitter: parsed.data.twitter,
    rawJson: { privyUserId: verified.privyUserId, twitter: parsed.data.twitter }
  });

  try {
    await verifyOnchainEchoVote({
      txHash: parsed.data.onchainTxHash as `0x${string}`,
      walletAddress: parsed.data.onchainWalletAddress,
      chainId: parsed.data.onchainChainId,
      analysisHash: parsed.data.analysisHash,
      symbol,
      snapshotTimestamp: snapshotTimestamp.toISOString(),
      voteValue: parsed.data.voteValue
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Monad transaction could not be verified.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const identityFilters = [
    { profileId: profile.id },
    { privyUserId: verified.privyUserId },
    parsed.data.browserId ? { browserId: parsed.data.browserId } : undefined,
    { walletAddress: parsed.data.onchainWalletAddress }
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  const duplicate = await prisma.echoVote.findFirst({
    where: {
      analysisHash: parsed.data.analysisHash,
      horizonHours: parsed.data.horizonHours,
      OR: identityFilters
    }
  });
  if (duplicate) {
    const consensus = await buildConsensus({
      analysisHash: parsed.data.analysisHash,
      symbol: parsed.data.symbol,
      snapshotTimestamp,
      horizonHours: parsed.data.horizonHours
    });
    return NextResponse.json(jsonSafePublic({ error: "Consensus already recorded for this market state.", consensus }), { status: 409 });
  }

  let vote;
  try {
    vote = await prisma.echoVote.create({
      select: consensusSelect,
      data: {
        analysisHash: parsed.data.analysisHash,
        symbol,
        snapshotTimestamp,
        horizonHours: parsed.data.horizonHours,
        profileId: profile.id,
        privyUserId: verified.privyUserId,
        twitterUsername: profile.twitterUsername,
        twitterName: profile.twitterName,
        twitterImageUrl: profile.twitterImageUrl,
        onchainTxHash: parsed.data.onchainTxHash,
        onchainChainId: parsed.data.onchainChainId,
        onchainWalletAddress: parsed.data.onchainWalletAddress,
        browserId: parsed.data.browserId ?? null,
        walletAddress: parsed.data.onchainWalletAddress,
        voteValue: parsed.data.voteValue
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const consensus = await buildConsensus({ analysisHash: parsed.data.analysisHash, symbol, snapshotTimestamp, horizonHours: 4 });
      return NextResponse.json(jsonSafePublic({ error: "Consensus already recorded for this market state.", consensus }), { status: 409 });
    }
    throw error;
  }

  const consensus = await buildConsensus({
    analysisHash: parsed.data.analysisHash,
    symbol: parsed.data.symbol,
    snapshotTimestamp,
    horizonHours: parsed.data.horizonHours
  });
  return NextResponse.json(jsonSafePublic({ vote, consensus }));
}

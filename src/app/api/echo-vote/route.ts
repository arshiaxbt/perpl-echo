import { NextResponse } from "next/server";
import { z } from "zod";
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
  walletAddress: z.string().max(80).optional().nullable(),
  voteValue: z.enum(["BULLISH", "BEARISH"]),
  signature: z.string().max(4096).optional().nullable(),
  message: z.string().max(4096).optional().nullable(),
  privyUserId: z.string().min(8).optional().nullable(),
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
  const profile =
    verified && parsed.data.privyUserId === verified.privyUserId
      ? await upsertUserProfile({
          privyUserId: verified.privyUserId,
          twitter: parsed.data.twitter,
          rawJson: { privyUserId: verified.privyUserId, twitter: parsed.data.twitter }
        })
      : null;

  const identityFilters = [
    profile ? { profileId: profile.id } : undefined,
    verified ? { privyUserId: verified.privyUserId } : undefined,
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
    return NextResponse.json(jsonSafePublic({ error: "Consensus already recorded for this market state.", consensus }), { status: 409 });
  }

  const vote = await prisma.echoVote.create({
    select: consensusSelect,
    data: {
      analysisHash: parsed.data.analysisHash,
      symbol: parsed.data.symbol.toUpperCase(),
      snapshotTimestamp,
      horizonHours: parsed.data.horizonHours,
      profileId: profile?.id ?? null,
      privyUserId: verified?.privyUserId ?? null,
      twitterUsername: profile?.twitterUsername ?? null,
      twitterName: profile?.twitterName ?? null,
      twitterImageUrl: profile?.twitterImageUrl ?? null,
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

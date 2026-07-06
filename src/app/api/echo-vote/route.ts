import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonSafePublic } from "@/lib/json";

const voteSchema = z.object({
  analysisHash: z.string().min(16).max(128),
  symbol: z.string().min(1).max(32),
  walletAddress: z.string().max(80).optional().nullable(),
  voteValue: z.union([z.literal(1), z.literal(-1)]),
  signature: z.string().max(4096).optional().nullable(),
  message: z.string().max(4096).optional().nullable()
});

export async function POST(request: Request) {
  const parsed = voteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid vote payload" }, { status: 400 });

  const vote = await prisma.echoVote.create({
    data: {
      analysisHash: parsed.data.analysisHash,
      symbol: parsed.data.symbol.toUpperCase(),
      walletAddress: parsed.data.walletAddress ?? null,
      voteValue: parsed.data.voteValue,
      signature: parsed.data.signature ?? null,
      message: parsed.data.message ?? null
    }
  });

  const counts = await countVotes(parsed.data.analysisHash);
  return NextResponse.json(jsonSafePublic({ vote, counts }));
}

async function countVotes(analysisHash: string) {
  const [upvotes, downvotes] = await Promise.all([
    prisma.echoVote.count({ where: { analysisHash, voteValue: 1 } }),
    prisma.echoVote.count({ where: { analysisHash, voteValue: -1 } })
  ]);
  return { upvotes, downvotes, score: upvotes - downvotes };
}

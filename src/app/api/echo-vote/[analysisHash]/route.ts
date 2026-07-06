import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ analysisHash: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const { analysisHash } = await params;
  const [upvotes, downvotes] = await Promise.all([
    prisma.echoVote.count({ where: { analysisHash, voteValue: 1 } }),
    prisma.echoVote.count({ where: { analysisHash, voteValue: -1 } })
  ]);
  return NextResponse.json({ analysisHash, upvotes, downvotes, score: upvotes - downvotes });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  let databaseConnected = false;
  let latestSnapshotTimestamp: Date | null = null;
  let latestOnchainProcessedBlock: string | null = null;
  let message: string | null = null;

  try {
    const [latestSnapshot, latestCursor] = await Promise.all([
      prisma.marketSnapshot.findFirst({
        orderBy: { timestamp: "desc" },
        select: { timestamp: true }
      }),
      prisma.onchainBlockCursor.findFirst({
        orderBy: { updatedAt: "desc" },
        select: { lastProcessedBlock: true }
      })
    ]);
    databaseConnected = true;
    latestSnapshotTimestamp = latestSnapshot?.timestamp ?? null;
    latestOnchainProcessedBlock = latestCursor?.lastProcessedBlock.toString() ?? null;
  } catch (error) {
    message = error instanceof Error ? error.message : "Database health check failed";
  }

  return NextResponse.json(
    {
      ok: databaseConnected,
      appVersion: process.env.npm_package_version ?? null,
      databaseConnected,
      latestSnapshotTimestamp,
      latestOnchainProcessedBlock,
      message
    },
    { status: databaseConnected ? 200 : 503 }
  );
}

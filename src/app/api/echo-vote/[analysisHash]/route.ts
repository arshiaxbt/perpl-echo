import { NextResponse } from "next/server";
import { buildConsensus } from "../shared";

type Params = {
  params: Promise<{ analysisHash: string }>;
};

export async function GET(request: Request, { params }: Params) {
  const { analysisHash } = await params;
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol");
  const timestamp = url.searchParams.get("snapshotTimestamp");
  const snapshotTimestamp = timestamp ? new Date(timestamp) : null;
  const consensus = await buildConsensus({
    analysisHash,
    symbol,
    snapshotTimestamp: snapshotTimestamp && Number.isFinite(snapshotTimestamp.getTime()) ? snapshotTimestamp : null,
    horizonHours: 4
  });
  return NextResponse.json(consensus);
}

import { NextResponse } from "next/server";
import { allClusters } from "@/lib/cluster-service";
import { jsonSafePublic } from "@/lib/json";

export async function GET() {
  const clusters = await allClusters();
  return NextResponse.json(jsonSafePublic({ clusters }));
}

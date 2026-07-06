import { createHash } from "crypto";
import type { MarketSnapshot } from "@prisma/client";
import { env } from "./env";

export function buildAnalysisHash({
  symbol,
  snapshot,
  clusterId
}: {
  symbol: string;
  snapshot: MarketSnapshot;
  clusterId?: string | null;
}) {
  const payload = {
    symbol: symbol.toUpperCase(),
    timestamp: snapshot.timestamp.toISOString(),
    regime: snapshot.regime,
    clusterId: clusterId ?? snapshot.clusterId ?? null,
    chainId: env.PERPL_CHAIN_ID,
    vector: {
      fundingRate: round(snapshot.fundingRate, 10),
      fundingApr: round(snapshot.fundingApr, 6),
      return1hBefore: round(snapshot.return1hBefore, 6),
      return4hBefore: round(snapshot.return4hBefore, 6),
      return24hBefore: round(snapshot.return24hBefore, 6),
      volumeChange: round(snapshot.volumeChange, 6),
      volatility: round(snapshot.volatility, 6),
      trendScore: round(snapshot.trendScore, 6),
      spread: snapshot.spread === null ? null : round(snapshot.spread, 8),
      openInterest: snapshot.openInterest === null ? null : round(snapshot.openInterest, 6)
    }
  };

  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

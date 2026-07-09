import { prisma } from "./prisma";
import type { MarketSnapshot } from "@prisma/client";

export async function crossMarketEcho(symbol: string, matchTimestamps: Date[]) {
  const source = await prisma.market.findUnique({ where: { symbol: symbol.toUpperCase() } });
  if (!source || !matchTimestamps.length) return null;
  const markets = await prisma.market.findMany({ where: { active: true, id: { not: source.id } }, orderBy: { symbol: "asc" } });
  const sampledTimestamps = matchTimestamps.slice(0, 10);
  const minTimestamp = new Date(Math.min(...sampledTimestamps.map((timestamp) => timestamp.getTime())) - 5 * 60 * 1000);
  const maxTimestamp = new Date(Math.max(...sampledTimestamps.map((timestamp) => timestamp.getTime())) + 24 * 60 * 60 * 1000 + 15 * 60 * 1000);
  const rows = [];
  for (const market of markets) {
    const snapshots = await prisma.marketSnapshot.findMany({
      where: { marketId: market.id, timestamp: { gte: minTimestamp, lte: maxTimestamp } },
      orderBy: { timestamp: "asc" },
      select: { id: true, marketId: true, timestamp: true, price: true }
    });
    const outcomes = [];
    for (const timestamp of sampledTimestamps) {
      const base = nearestSnapshot(snapshots, timestamp);
      if (!base) continue;
      outcomes.push(futureReturns(base, snapshots));
    }
    rows.push({
      market: market.symbol,
      averageReturn1h: avg(outcomes.map((outcome) => outcome.return1h)),
      averageReturn4h: avg(outcomes.map((outcome) => outcome.return4h)),
      averageReturn24h: avg(outcomes.map((outcome) => outcome.return24h)),
      sampleSize: outcomes.length
    });
  }
  const strongestPositive = [...rows].sort((a, b) => (b.averageReturn4h ?? -Infinity) - (a.averageReturn4h ?? -Infinity))[0] ?? null;
  const strongestNegative = [...rows].sort((a, b) => (a.averageReturn4h ?? Infinity) - (b.averageReturn4h ?? Infinity))[0] ?? null;
  return { sourceMarket: source.symbol, rows, strongestPositive, strongestNegative };
}

type CrossMarketSnapshot = Pick<MarketSnapshot, "id" | "marketId" | "timestamp" | "price">;

function nearestSnapshot(snapshots: CrossMarketSnapshot[], timestamp: Date) {
  const toleranceMs = 5 * 60 * 1000;
  const targetMs = timestamp.getTime();
  return (
    snapshots
      .filter((snapshot) => Math.abs(snapshot.timestamp.getTime() - targetMs) <= toleranceMs)
      .sort((a, b) => Math.abs(a.timestamp.getTime() - targetMs) - Math.abs(b.timestamp.getTime() - targetMs))[0] ?? null
  );
}

function futureReturns(base: CrossMarketSnapshot, history: CrossMarketSnapshot[]) {
  return {
    return1h: returnAt(base, history, 1),
    return4h: returnAt(base, history, 4),
    return24h: returnAt(base, history, 24)
  };
}

function returnAt(base: CrossMarketSnapshot, history: CrossMarketSnapshot[], hours: number) {
  const target = base.timestamp.getTime() + hours * 60 * 60 * 1000;
  const found = history.find((snapshot) => Math.abs(snapshot.timestamp.getTime() - target) <= 15 * 60 * 1000);
  return found && base.price > 0 ? ((found.price - base.price) / base.price) * 100 : null;
}

function avg(values: Array<number | null>) {
  const sample = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return sample.length ? sample.reduce((sum, value) => sum + value, 0) / sample.length : null;
}

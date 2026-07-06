import { prisma } from "./prisma";
import type { MarketSnapshot } from "@prisma/client";

export async function crossMarketEcho(symbol: string, matchTimestamps: Date[]) {
  const source = await prisma.market.findUnique({ where: { symbol: symbol.toUpperCase() } });
  if (!source || !matchTimestamps.length) return null;
  const markets = await prisma.market.findMany({ where: { active: true, id: { not: source.id } }, orderBy: { symbol: "asc" } });
  const rows = [];
  for (const market of markets) {
    const outcomes = [];
    for (const timestamp of matchTimestamps.slice(0, 50)) {
      const base = await nearestSnapshot(market.id, timestamp);
      if (!base) continue;
      const history = await prisma.marketSnapshot.findMany({
        where: { marketId: market.id, timestamp: { gt: base.timestamp } },
        orderBy: { timestamp: "asc" },
        take: 400
      });
      outcomes.push(futureReturns(base, history));
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

async function nearestSnapshot(marketId: number, timestamp: Date) {
  const from = new Date(timestamp.getTime() - 5 * 60 * 1000);
  const to = new Date(timestamp.getTime() + 5 * 60 * 1000);
  return prisma.marketSnapshot.findFirst({ where: { marketId, timestamp: { gte: from, lte: to } }, orderBy: { timestamp: "asc" } });
}

function futureReturns(base: MarketSnapshot, history: MarketSnapshot[]) {
  return {
    return1h: returnAt(base, history, 1),
    return4h: returnAt(base, history, 4),
    return24h: returnAt(base, history, 24)
  };
}

function returnAt(base: MarketSnapshot, history: MarketSnapshot[], hours: number) {
  const target = base.timestamp.getTime() + hours * 60 * 60 * 1000;
  const found = history.find((snapshot) => Math.abs(snapshot.timestamp.getTime() - target) <= 15 * 60 * 1000);
  return found && base.price > 0 ? ((found.price - base.price) / base.price) * 100 : null;
}

function avg(values: Array<number | null>) {
  const sample = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return sample.length ? sample.reduce((sum, value) => sum + value, 0) / sample.length : null;
}

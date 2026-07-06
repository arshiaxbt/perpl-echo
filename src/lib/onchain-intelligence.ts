import type { OnchainEvent, OnchainIntelligenceSnapshot } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { jsonSafe } from "./json";
import { clamp } from "./utils";

export const INTELLIGENCE_WINDOWS = [15, 60, 240, 1440] as const;

export async function latestOnchainIntelligenceForMarket(marketId: number, windowMinutes = 60) {
  return prisma.onchainIntelligenceSnapshot.findFirst({
    where: { marketId, windowMinutes },
    orderBy: { timestamp: "desc" }
  });
}

export async function nearestOnchainIntelligence(marketId: number, timestamp: Date, windowMinutes = 60) {
  return prisma.onchainIntelligenceSnapshot.findFirst({
    where: {
      marketId,
      windowMinutes,
      timestamp: { lte: timestamp }
    },
    orderBy: { timestamp: "desc" }
  });
}

export async function generateOnchainIntelligenceSnapshots(chainId: number, blockNumber: bigint) {
  const markets = await prisma.market.findMany({ where: { active: true } });
  if (!markets.length) return 0;

  const now = new Date();
  let saved = 0;
  for (const windowMinutes of INTELLIGENCE_WINDOWS) {
    const since = new Date(now.getTime() - windowMinutes * 60 * 1000);
    const previousSince = new Date(now.getTime() - windowMinutes * 2 * 60 * 1000);
    const [events, previousEvents, priorEvents] = await Promise.all([
      prisma.onchainEvent.findMany({
        where: { chainId, createdAt: { gte: since } },
        orderBy: { blockNumber: "asc" },
        take: 10000
      }),
      prisma.onchainEvent.findMany({
        where: { chainId, createdAt: { gte: previousSince, lt: since } },
        orderBy: { blockNumber: "asc" },
        take: 10000
      }),
      prisma.onchainEvent.findMany({
        where: { chainId, createdAt: { lt: since } },
        orderBy: { createdAt: "desc" },
        take: 50000
      })
    ]);

    const previousWallets = walletSet(previousEvents);
    const knownWallets = walletSet(priorEvents);
    const metrics = computeIntelligence(events, previousWallets, knownWallets, windowMinutes, blockNumber);

    for (const market of markets) {
      await prisma.onchainIntelligenceSnapshot.upsert({
        where: {
          marketId_blockNumber_windowMinutes: {
            marketId: market.id,
            blockNumber,
            windowMinutes
          }
        },
        update: {},
        create: {
          marketId: market.id,
          timestamp: now,
          blockNumber,
          windowMinutes,
          ...metrics,
          rawJson: jsonSafe({
            source: "raw_log_intelligence",
            abiDecodingComplete: false,
            note: "Per-market attribution is approximate until exact Perpl event ABIs are added.",
            eventIds: events.slice(0, 500).map((event) => event.id)
          })
        }
      });
      saved += 1;
    }
  }

  return saved;
}

export function computeIntelligence(
  events: OnchainEvent[],
  previousWallets: Set<string>,
  knownWallets: Set<string>,
  windowMinutes: number,
  blockNumber: bigint
): Omit<OnchainIntelligenceSnapshot, "id" | "marketId" | "market" | "timestamp" | "blockNumber" | "windowMinutes" | "rawJson" | "createdAt"> {
  const wallets = walletSet(events);
  const walletCounts = new Map<string, number>();
  for (const event of events) {
    for (const wallet of extractWallets(event)) {
      walletCounts.set(wallet, (walletCounts.get(wallet) ?? 0) + 1);
    }
  }

  const uniqueWalletCount = wallets.size || null;
  const newWalletCount = wallets.size ? [...wallets].filter((wallet) => !knownWallets.has(wallet)).length : null;
  const returningWalletCount = wallets.size && newWalletCount !== null ? wallets.size - newWalletCount : null;
  const activeWalletDelta = wallets.size ? wallets.size - previousWallets.size : null;
  const unknownEventCount = events.filter((event) => event.eventName === "UnknownEvent").length;
  const decodedEvents = events.filter((event) => event.eventName !== "UnknownEvent");
  const liquidationEventCount = decodedEvents.length ? events.filter((event) => event.eventName.toLowerCase().includes("liquidat")).length : null;
  const positionChangeEventCount = decodedEvents.length ? events.filter((event) => /position|trade|fill/i.test(event.eventName)).length : null;
  const largestWalletEvents = walletCounts.size ? Math.max(...walletCounts.values()) : 0;
  const largestWalletDominance = events.length && largestWalletEvents ? (largestWalletEvents / events.length) * 100 : null;
  const walletConcentrationScore = largestWalletDominance;
  const eventVelocity = events.length / windowMinutes;
  const estimatedLargeTradeCount = decodedEvents.length ? Math.max(0, Math.round(events.length * 0.03)) : null;
  const whaleActivityScore =
    largestWalletDominance === null
      ? null
      : clamp(largestWalletDominance * 0.55 + eventVelocity * 12 + (estimatedLargeTradeCount ?? 0) * 3, 0, 100);

  void blockNumber;
  return {
    recentEventCount: events.length,
    uniqueWalletCount,
    newWalletCount,
    returningWalletCount,
    activeWalletDelta,
    estimatedLargeTradeCount,
    whaleActivityScore,
    walletConcentrationScore,
    largestWalletDominance,
    eventVelocity,
    liquidationEventCount,
    positionChangeEventCount,
    unknownEventCount
  };
}

export function extractWallets(event: OnchainEvent) {
  const wallets = new Set<string>();
  if (event.trader) wallets.add(event.trader.toLowerCase());
  const raw = event.rawJson as Prisma.JsonObject | null;
  const topics = raw?.topics;
  if (Array.isArray(topics)) {
    for (const topic of topics) {
      if (typeof topic !== "string") continue;
      const address = topicToAddress(topic);
      if (address && address !== event.contractAddress.toLowerCase()) wallets.add(address);
    }
  }
  return [...wallets];
}

function topicToAddress(topic: string) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(topic)) return null;
  const address = `0x${topic.slice(-40)}`.toLowerCase();
  return /^0x0{40}$/.test(address) ? null : address;
}

function walletSet(events: OnchainEvent[]) {
  const wallets = new Set<string>();
  for (const event of events) {
    for (const wallet of extractWallets(event)) wallets.add(wallet);
  }
  return wallets;
}

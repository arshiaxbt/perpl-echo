import { createPublicClient, http, type Address, type Log } from "viem";
import { env } from "./env";
import { prisma } from "./prisma";
import { jsonSafe } from "./json";

export type OnchainIndexerStatus = {
  enabled: boolean;
  configured: boolean;
  rpcConnected: boolean;
  latestProcessedBlock: string | null;
  eventCount: number;
  message: string | null;
};

export function getContractAddresses() {
  return env.PERPL_CONTRACT_ADDRESSES.split(",")
    .map((address) => address.trim())
    .filter(Boolean)
    .map((address) => address.toLowerCase());
}

export async function getOnchainStatus(): Promise<OnchainIndexerStatus> {
  const [latestCursor, eventCount] = await Promise.all([
    prisma.onchainBlockCursor.findFirst({ orderBy: { updatedAt: "desc" } }),
    approximateOnchainEventCount()
  ]);

  const configured = Boolean(env.MONAD_RPC_URL && getContractAddresses().length);
  let rpcConnected = false;
  let message: string | null = null;

  if (configured) {
    try {
      const client = createMonadClient();
      await withTimeout(client.getBlockNumber(), 3000);
      rpcConnected = true;
    } catch (error) {
      message = error instanceof Error ? error.message : "RPC connection failed";
    }
  } else if (!env.ONCHAIN_INDEXER_ENABLED) {
    message = "On-chain indexer disabled.";
  } else {
    message = "Set MONAD_RPC_URL and PERPL_CONTRACT_ADDRESSES to enable indexing.";
  }

  return {
    enabled: env.ONCHAIN_INDEXER_ENABLED,
    configured,
    rpcConnected,
    latestProcessedBlock: latestCursor?.lastProcessedBlock.toString() ?? null,
    eventCount,
    message
  };
}

async function approximateOnchainEventCount() {
  const rows = await prisma.$queryRaw<Array<{ estimate: bigint | number | string }>>`
    SELECT COALESCE(reltuples, 0)::bigint AS estimate
    FROM pg_class
    WHERE oid = '"OnchainEvent"'::regclass
  `;
  const estimate = rows[0]?.estimate ?? 0;
  return Number(estimate);
}

async function withTimeout<T>(promise: Promise<T>, ms: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("RPC status check timed out")), ms);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function createMonadClient() {
  return createPublicClient({
    transport: http(env.MONAD_RPC_URL)
  });
}

export async function latestOnchainContextForMarket(marketId: number) {
  return prisma.onchainMarketSnapshot.findFirst({
    where: { marketId },
    orderBy: { timestamp: "desc" }
  });
}

export async function nearestOnchainContext(marketId: number, timestamp: Date) {
  return prisma.onchainMarketSnapshot.findFirst({
    where: {
      marketId,
      timestamp: {
        lte: timestamp
      }
    },
    orderBy: { timestamp: "desc" }
  });
}

export function unknownEventFromLog(chainId: number, log: Log) {
  return {
    chainId,
    blockNumber: log.blockNumber ?? 0n,
    blockHash: log.blockHash ?? "",
    txHash: log.transactionHash ?? "",
    logIndex: log.logIndex ?? 0,
    contractAddress: (log.address ?? "").toLowerCase(),
    eventName: "UnknownEvent",
    marketSymbol: null,
    trader: null,
    rawJson: jsonSafe(log)
  };
}

export function loadPerplAbi(contractAddress: string) {
  // TODO: Load exact Perpl contract ABI(s) and decode logs by event signature.
  // The MVP stores raw logs first so the indexer is useful before ABI coverage is complete.
  void contractAddress;
  return [];
}

export function maybeDecodePerplLog(chainId: number, log: Log) {
  loadPerplAbi(log.address ?? "");
  // TODO: Decode known Perpl events, map market ids/symbols, trader addresses, trades, liquidations, and sizes.
  return unknownEventFromLog(chainId, log);
}

export function isAddress(value: string): value is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

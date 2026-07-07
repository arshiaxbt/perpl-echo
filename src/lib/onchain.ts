import { createPublicClient, http, type Address, type Log } from "viem";
import { env } from "./env";
import { prisma } from "./prisma";
import { jsonSafe } from "./json";
import type { OnchainOperationalState } from "./data-quality";

export type OnchainIndexerStatus = {
  enabled: boolean;
  configured: boolean;
  state: OnchainOperationalState;
  rpcConnected: boolean;
  latestProcessedBlock: string | null;
  latestNetworkBlock: string | null;
  blockLag: string | null;
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
  let latestNetworkBlock: bigint | null = null;
  let message: string | null = null;

  if (!env.ONCHAIN_INDEXER_ENABLED) {
    message = "On-chain indexer disabled.";
  } else if (!configured) {
    message = "Set MONAD_RPC_URL and PERPL_CONTRACT_ADDRESSES to enable indexing.";
  } else {
    try {
      const client = createMonadClient();
      latestNetworkBlock = await withTimeout(client.getBlockNumber(), 3000);
      rpcConnected = true;
    } catch (error) {
      message = error instanceof Error ? error.message : "RPC connection failed";
    }
  }

  const latestProcessedBlock = latestCursor?.lastProcessedBlock ?? null;
  const blockLag =
    latestNetworkBlock !== null && latestProcessedBlock !== null ? latestNetworkBlock - latestProcessedBlock : null;
  const state = onchainState({
    enabled: env.ONCHAIN_INDEXER_ENABLED,
    configured,
    rpcConnected,
    latestProcessedBlock,
    latestNetworkBlock,
    blockLag
  });

  return {
    enabled: env.ONCHAIN_INDEXER_ENABLED,
    configured,
    state,
    rpcConnected,
    latestProcessedBlock: latestProcessedBlock?.toString() ?? null,
    latestNetworkBlock: latestNetworkBlock?.toString() ?? null,
    blockLag: blockLag?.toString() ?? null,
    eventCount,
    message: message ?? statusMessage(state)
  };
}

function onchainState({
  enabled,
  configured,
  rpcConnected,
  latestProcessedBlock,
  latestNetworkBlock,
  blockLag
}: {
  enabled: boolean;
  configured: boolean;
  rpcConnected: boolean;
  latestProcessedBlock: bigint | null;
  latestNetworkBlock: bigint | null;
  blockLag: bigint | null;
}): OnchainOperationalState {
  if (!enabled) return "disabled";
  if (!configured) return "not_configured";
  if (!rpcConnected) return "offline";
  if (!latestProcessedBlock || !latestNetworkBlock) return "syncing";
  if (blockLag !== null && blockLag > 500n) return "syncing";
  return "healthy";
}

function statusMessage(state: OnchainOperationalState) {
  if (state === "disabled") return "On-chain indexer disabled.";
  if (state === "not_configured") return "Set MONAD_RPC_URL and PERPL_CONTRACT_ADDRESSES to enable indexing.";
  if (state === "offline") return "Configured RPC is not reachable.";
  if (state === "syncing") return "On-chain indexer is syncing.";
  return "On-chain indexer healthy.";
}

async function approximateOnchainEventCount() {
  const rows = await prisma.$queryRaw<Array<{ estimate: bigint | number | string }>>`
    SELECT COALESCE(reltuples, 0)::bigint AS estimate
    FROM pg_class
    WHERE oid = '"OnchainEvent"'::regclass
  `;
  const estimate = rows[0]?.estimate ?? 0;
  return Math.max(0, Number(estimate));
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

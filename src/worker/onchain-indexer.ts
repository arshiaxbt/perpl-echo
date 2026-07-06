import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { createMonadClient, getContractAddresses, isAddress, maybeDecodePerplLog } from "@/lib/onchain";
import { jsonSafe } from "@/lib/json";
import { generateOnchainIntelligenceSnapshots } from "@/lib/onchain-intelligence";

const MAX_BLOCK_SPAN = 100n;

export async function runOnchainIndexerOnce() {
  if (!env.ONCHAIN_INDEXER_ENABLED) {
    console.log("[onchain] disabled");
    return { eventsSaved: 0, latestBlock: null, skipped: true };
  }

  if (!env.MONAD_RPC_URL) {
    console.log("[onchain] MONAD_RPC_URL empty; skipping");
    return { eventsSaved: 0, latestBlock: null, skipped: true };
  }

  const addresses = getContractAddresses().filter(isAddress);
  if (addresses.length === 0) {
    console.log("[onchain] PERPL_CONTRACT_ADDRESSES empty or invalid; skipping");
    return { eventsSaved: 0, latestBlock: null, skipped: true };
  }

  const client = createMonadClient();
  const chainId = env.PERPL_CHAIN_ID;
  let latestBlock: bigint;

  try {
    latestBlock = await client.getBlockNumber();
  } catch (error) {
    console.error("[onchain] RPC getBlockNumber failed", error);
    return { eventsSaved: 0, latestBlock: null, skipped: true };
  }

  let eventsSaved = 0;

  for (const address of addresses) {
    const cursor = await prisma.onchainBlockCursor.findUnique({
      where: {
        chainId_contractAddress: {
          chainId,
          contractAddress: address
        }
      }
    });

    const firstBlock = env.ONCHAIN_START_BLOCK ?? latestBlock;
    const fromBlock = cursor ? cursor.lastProcessedBlock + 1n : firstBlock;
    if (fromBlock > latestBlock) continue;

    const toBlock = latestBlock - fromBlock > MAX_BLOCK_SPAN ? fromBlock + MAX_BLOCK_SPAN : latestBlock;

    try {
      const logs = await client.getLogs({
        address,
        fromBlock,
        toBlock
      });

      for (const log of logs) {
        const event = maybeDecodePerplLog(chainId, log);
        await prisma.onchainEvent.upsert({
          where: {
            chainId_txHash_logIndex: {
              chainId,
              txHash: event.txHash,
              logIndex: event.logIndex
            }
          },
          update: {},
          create: event
        });
        eventsSaved += 1;
      }

      await prisma.onchainBlockCursor.upsert({
        where: {
          chainId_contractAddress: {
            chainId,
            contractAddress: address
          }
        },
        update: {
          lastProcessedBlock: toBlock
        },
        create: {
          chainId,
          contractAddress: address,
          lastProcessedBlock: toBlock
        }
      });

      await createMarketSnapshotsFromDecodedEvents(chainId, toBlock);
      await generateOnchainIntelligenceSnapshots(chainId, toBlock);
    } catch (error) {
      console.error(`[onchain] log read failed address=${address} from=${fromBlock} to=${toBlock}`, error);
    }
  }

  try {
    await generateOnchainIntelligenceSnapshots(chainId, latestBlock);
  } catch (error) {
    console.error("[onchain] intelligence snapshot generation failed", error);
  }

  return { eventsSaved, latestBlock: latestBlock.toString(), skipped: false };
}

async function createMarketSnapshotsFromDecodedEvents(chainId: number, blockNumber: bigint) {
  const markets = await prisma.market.findMany({ where: { active: true } });
  if (markets.length === 0) return;

  for (const market of markets) {
    const events = await prisma.onchainEvent.findMany({
      where: {
        chainId,
        blockNumber: {
          lte: blockNumber
        },
        OR: [{ marketSymbol: market.symbol }, { marketSymbol: null }]
      },
      orderBy: { blockNumber: "desc" },
      take: 500
    });

    if (events.length === 0) continue;

    const traders = new Set(events.map((event) => event.trader).filter(Boolean));
    const txHashes = new Set(events.map((event) => event.txHash));
    const liquidationCount = events.filter((event) => event.eventName.toLowerCase().includes("liquidat")).length;
    const tradeCount = events.filter((event) => event.eventName.toLowerCase().includes("trade")).length;
    const decodedEvents = events.filter((event) => event.eventName !== "UnknownEvent");

    await prisma.onchainMarketSnapshot.upsert({
      where: {
        marketId_blockNumber: {
          marketId: market.id,
          blockNumber
        }
      },
      update: {},
      create: {
        marketId: market.id,
        timestamp: new Date(),
        blockNumber,
        txCount: txHashes.size,
        tradeCount: decodedEvents.length ? tradeCount : null,
        liquidationCount: decodedEvents.length ? liquidationCount : null,
        largeTradeCount: null,
        activeWalletCount: traders.size || null,
        whaleFlowScore: null,
        rawJson: jsonSafe({ source: "decoded_events", eventIds: events.map((event) => event.id) })
      }
    });
  }
}

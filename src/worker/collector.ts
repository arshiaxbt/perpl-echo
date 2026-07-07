import { prisma } from "@/lib/prisma";
import { deriveSnapshot, marketAssetsFromPerpl } from "@/lib/metrics";
import { effectiveMarketSymbol, PerplApiClient } from "@/lib/perpl";
import { ensureSnapshotRegime } from "@/lib/regime";

export async function collectSnapshotsOnce() {
  const run = await prisma.collectorRun.create({
    data: { status: "running" }
  });
  let snapshotsSaved = 0;
  let marketsChecked = 0;

  try {
    const client = new PerplApiClient();
    const context = await client.getContext();
    const activeMarkets = context.markets.filter((market) => market.config?.is_open !== false);
    await repairBlankSymbolMarket(activeMarkets);
    const toMs = Date.now();
    const fromMs = toMs - 30 * 60 * 60 * 1000;

    for (const perplMarket of activeMarkets) {
      marketsChecked += 1;
      const symbol = effectiveMarketSymbol(perplMarket);
      if (!symbol) {
        console.warn(`[collector] skipping market ${perplMarket.id}: missing symbol/name/size_units`);
        continue;
      }
      const assets = marketAssetsFromPerpl(perplMarket);
      const market = await prisma.market.upsert({
        where: { symbol },
        update: {
          baseAsset: assets.baseAsset,
          quoteAsset: assets.quoteAsset,
          active: perplMarket.config?.is_open !== false,
          name: perplMarket.name,
          priceDecimals: perplMarket.config.price_decimals,
          sizeDecimals: perplMarket.config.size_decimals,
          rawJson: perplMarket as object
        },
        create: {
          id: perplMarket.id,
          symbol,
          baseAsset: assets.baseAsset,
          quoteAsset: assets.quoteAsset,
          active: perplMarket.config?.is_open !== false,
          name: perplMarket.name,
          priceDecimals: perplMarket.config.price_decimals,
          sizeDecimals: perplMarket.config.size_decimals,
          rawJson: perplMarket as object
        }
      });

      const candles = await client.getCandles(perplMarket.id, 300, fromMs, toMs);
      const snapshot = deriveSnapshot(perplMarket, candles);
      if (!snapshot) continue;

      const savedSnapshot = await prisma.marketSnapshot.upsert({
        where: {
          marketId_timestamp: {
            marketId: market.id,
            timestamp: snapshot.timestamp
          }
        },
        update: {},
        create: {
          marketId: market.id,
          ...snapshot,
          rawJson: snapshot.rawJson as object
        }
      });
      await ensureSnapshotRegime(savedSnapshot);
      snapshotsSaved += 1;
    }

    await prisma.collectorRun.update({
      where: { id: run.id },
      data: {
        status: "success",
        finishedAt: new Date(),
        snapshotsSaved,
        marketsChecked
      }
    });

    return { snapshotsSaved, marketsChecked };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown collector error";
    console.error("[collector] failed", error);
    await prisma.collectorRun.update({
      where: { id: run.id },
      data: {
        status: "error",
        message,
        finishedAt: new Date(),
        snapshotsSaved,
        marketsChecked
      }
    });
    throw error;
  }
}

async function repairBlankSymbolMarket(activeMarkets: Array<{ id: number; symbol: string; name?: string; size_units?: string }>) {
  const blank = await prisma.market.findUnique({ where: { symbol: "" } });
  if (!blank) return;

  const source = activeMarkets.find((market) => market.id === blank.id);
  const symbol = source ? effectiveMarketSymbol(source) : blank.name?.toUpperCase();
  if (!symbol) return;

  const existing = await prisma.market.findUnique({ where: { symbol } });
  if (existing && existing.id !== blank.id) return;

  await prisma.market.update({
    where: { id: blank.id },
    data: {
      symbol,
      baseAsset: symbol
    }
  });
  console.log(`[collector] repaired blank market symbol id=${blank.id} symbol=${symbol}`);
}

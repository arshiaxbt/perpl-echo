import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { effectiveMarketSymbol, PerplApiClient, scaleFundingRate, scalePrice } from "@/lib/perpl";
import { floorToFiveMinutes, marketAssetsFromPerpl } from "@/lib/metrics";
import { classifyMissingRegimes } from "@/lib/regime";
import type { PerplCandle, PerplMarket } from "@/lib/perpl";

const RESOLUTION_SECONDS = 300;
const CHUNK_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS = Number(process.env.BACKFILL_DAYS ?? 30);

export async function backfillHistoricalCandles(days = DEFAULT_DAYS) {
  const client = new PerplApiClient();
  const context = await client.getContext();
  const activeMarkets = context.markets.filter((market) => market.config?.is_open !== false);
  const endMs = Date.now();
  const startMs = endMs - days * 24 * 60 * 60 * 1000;

  for (const perplMarket of activeMarkets) {
    const symbol = effectiveMarketSymbol(perplMarket);
    if (!symbol) continue;

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

    const candles = await fetchCandleHistory(client, perplMarket.id, startMs, endMs);
    console.log(`[backfill] ${symbol} candles=${candles.length}`);
    let saved = 0;

    for (let index = 0; index < candles.length; index += 1) {
      const snapshot = snapshotFromCandle(perplMarket, candles, index);
      if (!snapshot) continue;

      await prisma.marketSnapshot.upsert({
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
      saved += 1;
    }

    console.log(`[backfill] ${symbol} saved=${saved}`);
    await classifyMissingRegimes(market.id);
  }
}

async function main() {
  const days = Number(process.argv[2] ?? DEFAULT_DAYS);
  await backfillHistoricalCandles(days);
}

async function fetchCandleHistory(client: PerplApiClient, marketId: number, startMs: number, endMs: number) {
  const candles: PerplCandle[] = [];
  for (let fromMs = startMs; fromMs < endMs; fromMs += CHUNK_MS) {
    const toMs = Math.min(fromMs + CHUNK_MS - 1, endMs);
    try {
      const chunk = await client.getCandles(marketId, RESOLUTION_SECONDS, fromMs, toMs);
      candles.push(...chunk);
    } catch (error) {
      console.warn(`[backfill] candle chunk failed market=${marketId} from=${fromMs} to=${toMs}`, error);
    }
  }

  return dedupeCandles(candles).sort((a, b) => a.t - b.t);
}

function snapshotFromCandle(market: PerplMarket, candles: PerplCandle[], index: number) {
  const candle = candles[index];
  const priceDecimals = market.config.price_decimals;
  const price = scalePrice(candle.c, priceDecimals);
  if (!price || price <= 0) return null;

  const window = candles.slice(Math.max(0, index - 288), index + 1);
  const closes = window.map((item) => scalePrice(item.c, priceDecimals)).filter(isFiniteNumber);
  const fundingRate = scaleFundingRate(market.funding?.rate);
  const fundingIntervalHours = market.funding_interval_sec
    ? market.funding_interval_sec / 3600
    : env.PERPL_FUNDING_INTERVAL_HOURS;
  const fundingApr = fundingRate * (24 / fundingIntervalHours) * 365 * 100;
  const volume = Number(candle.v) || 0;
  const recentVolume = sumVolumes(candles.slice(Math.max(0, index - 11), index + 1));
  const previousVolume = sumVolumes(candles.slice(Math.max(0, index - 23), Math.max(0, index - 11)));
  const return1hBefore = returnBefore(candles, index, priceDecimals, 12, price);
  const return4hBefore = returnBefore(candles, index, priceDecimals, 48, price);
  const return24hBefore = returnBefore(candles, index, priceDecimals, 288, price);

  return {
    timestamp: floorToFiveMinutes(new Date(candle.t)),
    price,
    indexPrice: null,
    fundingRate,
    fundingApr,
    volume,
    openInterest: null,
    spread: null,
    orderbookImbalance: null,
    volatility: realizedVolatility(closes),
    return1hBefore,
    return4hBefore,
    return24hBefore,
    volumeChange: previousVolume > 0 ? ((recentVolume - previousVolume) / previousVolume) * 100 : 0,
    trendScore: return1hBefore * 0.5 + return4hBefore * 0.3 + return24hBefore * 0.2,
    rawJson: { source: "candle_backfill", candle, marketId: market.id }
  };
}

function returnBefore(candles: PerplCandle[], index: number, priceDecimals: number, periods: number, price: number) {
  const previous = candles[index - periods];
  if (!previous) return 0;
  const previousPrice = scalePrice(previous.c, priceDecimals);
  return previousPrice && previousPrice > 0 ? ((price - previousPrice) / previousPrice) * 100 : 0;
}

function realizedVolatility(closes: number[]) {
  if (closes.length < 3) return 0;
  const returns = closes.slice(1).map((close, index) => Math.log(close / closes[index])).filter(isFiniteNumber);
  if (returns.length < 2) return 0;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(288) * 100;
}

function sumVolumes(candles: PerplCandle[]) {
  return candles.reduce((sum, candle) => sum + (Number(candle.v) || 0), 0);
}

function dedupeCandles(candles: PerplCandle[]) {
  return Array.from(new Map(candles.map((candle) => [candle.t, candle])).values());
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

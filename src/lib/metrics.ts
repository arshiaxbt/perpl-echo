import type { PerplCandle, PerplMarket } from "./perpl";
import { effectiveMarketSymbol, scaleFundingRate, scalePrice, scaleSize } from "./perpl";
import { env } from "./env";

export type SnapshotInput = {
  timestamp: Date;
  price: number;
  indexPrice: number | null;
  fundingRate: number;
  fundingApr: number;
  volume: number;
  openInterest: number | null;
  spread: number | null;
  orderbookImbalance: number | null;
  volatility: number;
  return1hBefore: number;
  return4hBefore: number;
  return24hBefore: number;
  volumeChange: number;
  trendScore: number;
  rawJson: unknown;
};

export function marketAssets(symbol: string) {
  const cleaned = symbol.toUpperCase().replace(/[-_/]?(USD|USDC|USDT|AUSD|PERP)$/i, "");
  return {
    baseAsset: cleaned || symbol.toUpperCase(),
    quoteAsset: "AUSD"
  };
}

export function marketAssetsFromPerpl(market: PerplMarket) {
  return marketAssets(effectiveMarketSymbol(market));
}

export function deriveSnapshot(market: PerplMarket, candles: PerplCandle[], now = new Date()): SnapshotInput | null {
  const priceDecimals = market.config.price_decimals;
  const sizeDecimals = market.config.size_decimals;
  const state = market.state;

  const price =
    scalePrice(state?.mrk, priceDecimals) ??
    scalePrice(state?.mid, priceDecimals) ??
    scalePrice(state?.lst, priceDecimals);

  if (!price || price <= 0) return null;

  const indexPrice = scalePrice(market.funding?.idx ?? state?.orl, priceDecimals);
  const fundingRate = scaleFundingRate(market.funding?.rate);
  const fundingIntervalHours = market.funding_interval_sec
    ? market.funding_interval_sec / 3600
    : env.PERPL_FUNDING_INTERVAL_HOURS;
  const periodsPerDay = 24 / fundingIntervalHours;
  const fundingApr = fundingRate * periodsPerDay * 365 * 100;
  const volume = numberFromAmount(state?.dva) ?? scaleSize(state?.dv, sizeDecimals) ?? latestVolume(candles);
  const openInterest = scaleSize(state?.oi, sizeDecimals);
  const bid = scalePrice(state?.bid, priceDecimals);
  const ask = scalePrice(state?.ask, priceDecimals);
  const spread = bid && ask && price > 0 ? ((ask - bid) / price) * 100 : null;
  const orderbookImbalance = null;

  const closes = candles.map((candle) => scalePrice(candle.c, priceDecimals)).filter(isFiniteNumber);
  const return1hBefore = returnBefore(closes, price, 12);
  const return4hBefore = returnBefore(closes, price, 48);
  const return24hBefore = state?.prv
    ? percentChange(price, scalePrice(state.prv, priceDecimals) ?? price)
    : returnBefore(closes, price, 288);
  const volatility = realizedVolatility(closes.slice(-288));
  const volumeChange = computeVolumeChange(candles);
  const trendScore = return1hBefore * 0.5 + return4hBefore * 0.3 + return24hBefore * 0.2;
  const timestamp = floorToFiveMinutes(new Date(state?.at?.t ?? market.funding?.at?.t ?? now.getTime()));

  return {
    timestamp,
    price,
    indexPrice,
    fundingRate,
    fundingApr,
    volume,
    openInterest,
    spread,
    orderbookImbalance,
    volatility,
    return1hBefore,
    return4hBefore,
    return24hBefore,
    volumeChange,
    trendScore,
    rawJson: { market, candles: candles.slice(-288) }
  };
}

export function fundingPercentile(currentRate: number, historicalRates: number[]) {
  const sample = historicalRates.filter(isFiniteNumber);
  if (sample.length < 50) return null;
  const min = Math.min(...sample);
  const max = Math.max(...sample);
  if (Math.abs(max - min) < 1e-12) return 50;
  const below = sample.filter((rate) => rate <= currentRate).length;
  return (below / sample.length) * 100;
}

export function rarityLabel(percentile: number | null) {
  if (percentile === null) return "Insufficient data";
  const extremeness = Math.max(percentile, 100 - percentile);
  if (extremeness >= 97) return "Very Rare";
  if (extremeness >= 90) return "Rare";
  if (extremeness >= 75) return "Uncommon";
  return "Common";
}

export function rarityScore(percentile: number | null) {
  if (percentile === null) return null;
  return Math.max(percentile, 100 - percentile);
}

function returnBefore(closes: number[], current: number, periods: number) {
  if (closes.length <= periods) return 0;
  return percentChange(current, closes[closes.length - periods - 1]);
}

function percentChange(current: number, previous: number) {
  if (!previous || previous <= 0) return 0;
  return ((current - previous) / previous) * 100;
}

function realizedVolatility(closes: number[]) {
  if (closes.length < 3) return 0;
  const returns = closes.slice(1).map((close, index) => Math.log(close / closes[index])).filter(isFiniteNumber);
  if (returns.length < 2) return 0;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(288) * 100;
}

function computeVolumeChange(candles: PerplCandle[]) {
  if (candles.length < 24) return 0;
  const recent = sumVolumes(candles.slice(-12));
  const previous = sumVolumes(candles.slice(-24, -12));
  return previous > 0 ? ((recent - previous) / previous) * 100 : 0;
}

function sumVolumes(candles: PerplCandle[]) {
  return candles.reduce((sum, candle) => sum + (Number(candle.v) || 0), 0);
}

function latestVolume(candles: PerplCandle[]) {
  return candles.length ? Number(candles[candles.length - 1].v) || 0 : 0;
}

function numberFromAmount(value: string | undefined) {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function floorToFiveMinutes(date: Date) {
  const ms = 5 * 60 * 1000;
  return new Date(Math.floor(date.getTime() / ms) * ms);
}

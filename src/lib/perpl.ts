import { env } from "./env";

export type PerplMarket = {
  id: number;
  symbol: string;
  name?: string;
  size_units?: string;
  funding_interval_sec?: number;
  config: {
    is_open?: boolean;
    price_decimals: number;
    size_decimals: number;
  };
  state?: {
    at?: { t?: number };
    orl?: number;
    mrk?: number;
    lst?: number;
    mid?: number;
    bid?: number;
    ask?: number;
    prv?: number;
    dv?: number;
    dva?: string;
    oi?: number;
    tvl?: string;
  };
  funding?: {
    at?: { t?: number };
    rate?: number;
    idx?: number;
  };
};

export type PerplContext = {
  markets: PerplMarket[];
};

export type PerplCandle = {
  t: number;
  o: number;
  c: number;
  h: number;
  l: number;
  v: string;
  n: number;
};

export type PerplCandleSeries = {
  d: PerplCandle[];
};

export class PerplApiClient {
  constructor(private readonly apiUrl = env.PERPL_API_URL) {}

  async getContext(): Promise<PerplContext> {
    return this.getJson<PerplContext>("/v1/pub/context");
  }

  async getCandles(marketId: number, resolutionSeconds: number, fromMs: number, toMs: number) {
    const path = `/v1/market-data/${marketId}/candles/${resolutionSeconds}/${fromMs}-${toMs}`;
    const series = await this.getJson<PerplCandleSeries>(path);
    return Array.isArray(series.d) ? series.d : [];
  }

  private async getJson<T>(path: string): Promise<T> {
    const url = `${this.apiUrl}${path}`;
    let lastError: unknown;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(url, {
          headers: {
            accept: "application/json",
            "user-agent": "perpl-echo/0.1"
          },
          cache: "no-store"
        });

        if (response.status === 429 && attempt < 2) {
          await sleep(1000 * 2 ** attempt);
          continue;
        }

        if (!response.ok) {
          throw new Error(`Perpl API ${response.status} for ${path}`);
        }

        return (await response.json()) as T;
      } catch (error) {
        lastError = error;
        if (attempt < 2) await sleep(500 * 2 ** attempt);
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Perpl API request failed");
  }
}

export function scalePrice(value: number | null | undefined, decimals: number) {
  if (value === null || value === undefined) return null;
  return value / 10 ** decimals;
}

export function scaleSize(value: number | null | undefined, decimals: number) {
  if (value === null || value === undefined) return null;
  return value / 10 ** decimals;
}

export function scaleFundingRate(rateMicros: number | null | undefined) {
  if (rateMicros === null || rateMicros === undefined) return 0;
  return rateMicros / 1_000_000;
}

export function effectiveMarketSymbol(market: Pick<PerplMarket, "symbol" | "name" | "size_units">) {
  const raw = market.symbol || market.name || market.size_units || "";
  return raw.trim().toUpperCase();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

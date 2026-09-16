import type { ReferenceHistory, ReferenceProvider, ReferenceQuote } from "./provider";
import { classifySession, referenceGate } from "./provider";
import type { ReferenceSpec } from "./mapping";

interface YahooMeta {
  currency?: string;
  symbol?: string;
  exchangeName?: string;
  fullExchangeName?: string;
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  fulldayPrice?: number;
  regularMarketTime?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  currentTradingPeriod?: {
    pre?: { start: number; end: number };
    regular?: { start: number; end: number };
    post?: { start: number; end: number };
  };
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];

async function yahooChart(
  symbol: string,
  range: string,
  interval: string,
): Promise<{ meta: YahooMeta; timestamps: number[]; closes: (number | null)[] }> {
  let lastError: Error | null = null;
  for (const host of HOSTS) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(
        symbol,
      )}?interval=${interval}&range=${range}`;
      const res = await referenceGate.run(() =>
        fetch(url, {
          headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
          signal: AbortSignal.timeout(9_000),
          cache: "no-store",
        }),
      );
      if (res.status === 429) {
        lastError = new Error("rate limited");
        continue;
      }
      if (!res.ok) {
        lastError = new Error(`yahoo responded ${res.status}`);
        continue;
      }
      const json = (await res.json()) as {
        chart?: {
          result?: {
            meta?: YahooMeta;
            timestamp?: number[];
            indicators?: { quote?: { close?: (number | null)[] }[] };
          }[];
        };
      };
      const result = json.chart?.result?.[0];
      if (!result?.meta) {
        lastError = new Error("yahoo returned no chart data");
        continue;
      }
      return {
        meta: result.meta,
        timestamps: result.timestamp ?? [],
        closes: result.indicators?.quote?.[0]?.close ?? [],
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("yahoo request failed");
    }
  }
  throw lastError ?? new Error("yahoo request failed");
}

function buildQuote(meta: YahooMeta): ReferenceQuote | null {
  const regularClose = meta.regularMarketPrice ?? null;
  if (regularClose == null) return null;

  const session = classifySession(meta.currentTradingPeriod);
  const regularTime = (meta.regularMarketTime ?? Math.floor(Date.now() / 1000)) * 1000;

  // `fulldayPrice` is the provider's most recent print across sessions
  // (extended hours and overnight ATS included). It only becomes the
  // reference when the regular session is not live, because comparing a
  // 24/7 token against a stale close would misread overnight equity drift
  // as wrapper premium.
  const fullday = typeof meta.fulldayPrice === "number" ? meta.fulldayPrice : null;
  const useExtended = session !== "open" && fullday != null;
  const price = useExtended ? fullday : regularClose;
  const extendedPrice = useExtended ? fullday : null;

  const ageHours = (Date.now() - regularTime) / 3_600_000;

  return {
    symbol: meta.symbol ?? "",
    price,
    regularClose,
    extendedPrice,
    previousClose: meta.chartPreviousClose ?? null,
    dayHigh: meta.regularMarketDayHigh ?? null,
    dayLow: meta.regularMarketDayLow ?? null,
    currency: meta.currency ?? "USD",
    exchange: meta.fullExchangeName ?? meta.exchangeName ?? "",
    asOf: regularTime,
    session,
    stale: ageHours > 26,
    source: "yahoo",
    priceLabel:
      session === "open"
        ? "live regular-session price"
        : useExtended
          ? "latest print incl. extended hours"
          : "last regular close",
  };
}

export const yahooProvider: ReferenceProvider = {
  name: "yahoo",
  async fetchQuote(spec: ReferenceSpec): Promise<ReferenceQuote | null> {
    const { meta } = await yahooChart(spec.yahoo, "1d", "1d");
    return buildQuote(meta);
  },
};

export async function yahooHistory(spec: ReferenceSpec): Promise<ReferenceHistory> {
  const { meta, timestamps, closes } = await yahooChart(spec.yahoo, "2y", "1d");
  const out: Record<string, number> = {};
  for (let i = 0; i < timestamps.length; i += 1) {
    const close = closes[i];
    if (close == null) continue;
    out[new Date(timestamps[i] * 1000).toISOString().slice(0, 10)] = close;
  }
  return { symbol: meta.symbol ?? spec.yahoo, closes: out };
}

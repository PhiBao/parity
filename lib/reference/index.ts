import type { ReferenceHistory, ReferenceQuote } from "./provider";
import { yahooProvider, yahooHistory } from "./yahoo";
import { cnbcProvider } from "./cnbc";
import type { ReferenceSpec } from "./mapping";

export type { ReferenceQuote, ReferenceHistory, MarketSession } from "./provider";
export { classifySession } from "./provider";

const LIVE_TTL_MS = 60_000;
const STALE_TTL_MS = 20_000;
const HISTORY_TTL_MS = 6 * 60 * 60 * 1000;

const liveCache = new Map<string, { expires: number; value: ReferenceQuote | null }>();
const historyCache = new Map<string, { expires: number; value: ReferenceHistory | null }>();
const inflight = new Map<string, Promise<unknown>>();

function dedupe<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p = run().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/**
 * Reference quote with provider failover: Yahoo first (richest session data),
 * CNBC second (independent, keyless), cache third. A missing reference never
 * throws — the verdict engine degrades to relative pricing instead.
 */
export async function fetchReference(spec: ReferenceSpec): Promise<ReferenceQuote | null> {
  const key = spec.yahoo;
  const hit = liveCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const value = await dedupe(key, async (): Promise<ReferenceQuote | null> => {
    for (const provider of [yahooProvider, cnbcProvider]) {
      try {
        const quote = await provider.fetchQuote(spec);
        if (quote && quote.price > 0) {
          return { ...quote, symbol: quote.symbol || spec.yahoo };
        }
      } catch {
        // try the next provider
      }
    }
    return null;
  });

  liveCache.set(key, {
    expires: Date.now() + (value ? LIVE_TTL_MS : STALE_TTL_MS),
    value,
  });
  return value;
}

export async function fetchReferenceHistory(spec: ReferenceSpec): Promise<ReferenceHistory | null> {
  const key = spec.yahoo;
  const hit = historyCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const value = await dedupe(`hist:${key}`, async (): Promise<ReferenceHistory | null> => {
    try {
      const history = await yahooHistory(spec);
      return Object.keys(history.closes).length > 0 ? history : null;
    } catch {
      return null;
    }
  });

  historyCache.set(key, { expires: Date.now() + HISTORY_TTL_MS, value });
  return value;
}

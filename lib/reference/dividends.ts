import type { ReferenceSpec } from "./mapping";
import { referenceGate } from "./provider";

/**
 * Dividend accrual for total-return wrappers.
 *
 * Some tokenised equities (Ondo's `*on` tokens) are total-return instruments:
 * dividends are reinvested into the token, so its price legitimately drifts
 * above the raw ticker over time. Comparing such a token to a price-tracking
 * wrapper without adjusting for accrued dividends reports yield as if it were
 * mispricing — the exact trap CMC's own venue-landscape research warns about.
 *
 * We reconstruct the accrual from the underlying's dividend events:
 *
 *   factor(d) = Π over ex-dates e ≤ d of (1 + dividend_e / close_e)
 *
 * and compare wrappers on `token_price / factor`, which puts total-return and
 * price-tracking claims on the same economic footing.
 */

export interface DividendEvent {
  date: string;
  amount: number;
  /** Underlying close on the ex-date, used to convert cash into a ratio. */
  closeAtEx: number | null;
}

const EVENTS_TTL_MS = 6 * 60 * 60 * 1000;
const INCEPTION_TTL_MS = 24 * 60 * 60 * 1000;

const eventsCache = new Map<string, { expires: number; value: DividendEvent[] }>();
const inceptionCache = new Map<string, { expires: number; value: string | null }>();

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/**
 * Dividend events for a reference ticker.
 *
 * Returns `null` when the provider fails (so callers can mark data as
 * unresolved) and a (possibly empty) list on success. Failures are cached
 * briefly to avoid hammering a struggling provider; successes for 6h.
 */
const FAILURE_TTL_MS = 60_000;

export async function fetchDividendEvents(
  spec: ReferenceSpec,
): Promise<DividendEvent[] | null> {
  const key = spec.yahoo;
  const hit = eventsCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  let events: DividendEvent[] | null = [];
  try {
    const period1 = Math.floor((Date.now() - 3 * 365 * 86_400_000) / 1000);
    const period2 = Math.floor(Date.now() / 1000) + 86_400;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      spec.yahoo,
    )}?events=div&period1=${period1}&period2=${period2}&interval=1d`;
    const res = await referenceGate.run(() =>
      fetch(url, {
        headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
        signal: AbortSignal.timeout(9_000),
        cache: "no-store",
      }),
    );
    if (res.ok) {
      const json = (await res.json()) as {
        chart?: {
          result?: {
            timestamp?: number[];
            indicators?: { quote?: { close?: (number | null)[] }[] };
            events?: { dividends?: Record<string, { amount?: number; date?: number }> };
          }[];
        };
      };
      const result = json.chart?.result?.[0];
      // Closes come from the same payload — no second request needed.
      const closes: Record<string, number> = {};
      const stamps = result?.timestamp ?? [];
      const px = result?.indicators?.quote?.[0]?.close ?? [];
      for (let i = 0; i < stamps.length; i += 1) {
        if (px[i] != null) {
          closes[new Date(stamps[i] * 1000).toISOString().slice(0, 10)] = px[i] as number;
        }
      }
      const raw = result?.events?.dividends ?? {};
      events = Object.entries(raw)
        .map(([ts, div]) => {
          const date = new Date(Number(ts) * 1000).toISOString().slice(0, 10);
          const amount = Number(div.amount ?? 0);
          return {
            date,
            amount,
            closeAtEx: closes[date] ?? null,
          };
        })
        .filter((e) => e.amount > 0)
        .sort((a, b) => a.date.localeCompare(b.date));
    }
  } catch {
    events = null;
  }

  eventsCache.set(key, {
    expires: Date.now() + (events === null ? FAILURE_TTL_MS : EVENTS_TTL_MS),
    value: events ?? [],
  });
  return events;
}

/** Cumulative reinvestment factor from `since` (inclusive) to now. */
export function factorSince(events: DividendEvent[], since: string | null): number {
  let factor = 1;
  for (const e of events) {
    if (since && e.date < since) continue;
    if (e.closeAtEx && e.closeAtEx > 0) factor *= 1 + e.amount / e.closeAtEx;
  }
  return factor;
}

/** Running factor keyed by ex-date, for adjusting historical series. */
export function factorSeries(events: DividendEvent[]): Map<string, number> {
  const out = new Map<string, number>();
  let factor = 1;
  for (const e of events) {
    if (e.closeAtEx && e.closeAtEx > 0) factor *= 1 + e.amount / e.closeAtEx;
    out.set(e.date, factor);
  }
  return out;
}

/** Forward-filled factor for an arbitrary date. */
export function factorAt(series: Map<string, number>, date: string): number {
  let factor = 1;
  for (const [exDate, value] of series) {
    if (exDate <= date) factor = value;
    else break;
  }
  return factor;
}

export function trailingYieldPct(events: DividendEvent[], price: number | null): number | null {
  if (!price || price <= 0) return null;
  const cutoff = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const sum = events.filter((e) => e.date >= cutoff).reduce((acc, e) => acc + e.amount, 0);
  return (sum / price) * 100;
}

/**
 * First candle date for a wrapper token — the inception used as the accrual
 * window. One credit, cached for a day.
 */
export async function fetchTokenInception(
  cryptoId: number,
  loader: (id: number) => Promise<string | null>,
): Promise<string | null> {
  const key = String(cryptoId);
  const hit = inceptionCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await loader(cryptoId).catch(() => null);
  inceptionCache.set(key, { expires: Date.now() + INCEPTION_TTL_MS, value });
  return value;
}

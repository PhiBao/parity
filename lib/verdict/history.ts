import { cmcGetWithEvidence } from "@/lib/cmc/client";
import type { OhlcvHistorical, RwaAsset, RwaToken } from "@/lib/cmc/types";
import { fetchReferenceHistory } from "@/lib/reference";
import { referenceFor } from "@/lib/reference/mapping";
import { THRESHOLDS } from "@/lib/verdict/engine";

/** A single wrapper's daily closes, as reported by the CMC OHLCV endpoint. */
export interface WrapperHistory {
  symbol: string;
  cryptoId: number;
  issuerName: string | null;
  /** Split-adjusted daily closes. */
  points: { date: string; close: number }[];
}

export interface PremiumSeries {
  symbol: string;
  /** premium % of the token vs the (forward-filled) TradFi reference close. */
  points: { date: string; value: number }[];
}

export interface SpreadSeries {
  base: string;
  quote: string;
  /** (base / quote - 1) × 10000, in bps. Drift-free: both sides are tokens. */
  points: { date: string; bps: number }[];
}

export interface HistoryStats {
  windowStart: string | null;
  windowEnd: string | null;
  wrapperCount: number;
  maxAbsSpreadBps: number | null;
  spreadPair: { base: string; quote: string } | null;
  /** Mean |premium| on weekends (reference stale by construction) vs weekdays. */
  weekendMeanAbsPremiumPct: number | null;
  weekdayMeanAbsPremiumPct: number | null;
  /** Biggest single-day gap between two wrappers. */
  worstSpread: { date: string; bps: number; base: string; quote: string } | null;
  /** Biggest single-day premium vs the underlying. */
  worstPremium: { date: string; premiumPct: number; symbol: string } | null;
  episodeCount: number;
}

export interface HistoryPayload {
  symbol: string;
  referenceSymbol: string | null;
  wrappers: WrapperHistory[];
  premiums: PremiumSeries[];
  spreads: SpreadSeries[];
  stats: HistoryStats;
  /** Weekend dates in the window, so charts can shade closed-market days. */
  weekendDates: string[];
  evidenceIds: string[];
  generatedAt: string;
}

const MAX_WRAPPERS = 4;
const OHLCV_START = "2025-06-01";

function isWeekend(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

function candidateWrappers(asset: RwaAsset): RwaToken[] {
  return asset.tokens
    .filter((t) => !(t.issuer_name ?? "").toLowerCase().includes("derivative"))
    .filter((t) => t.price != null && (t.volume_24h ?? 0) >= THRESHOLDS.minWrapperVolumeUsd)
    .sort((a, b) => (b.volume_24h ?? 0) - (a.volume_24h ?? 0))
    .slice(0, MAX_WRAPPERS);
}

function forwardFill(dates: string[], closes: Record<string, number>): Record<string, number> {
  const keys = Object.keys(closes).sort();
  const out: Record<string, number> = {};
  let cursor = 0;
  let last: number | null = null;
  for (const date of [...dates].sort()) {
    while (cursor < keys.length && keys[cursor] <= date) {
      last = closes[keys[cursor]];
      cursor += 1;
    }
    if (last != null) out[date] = last;
  }
  return out;
}

async function fetchWrapperHistory(
  token: RwaToken,
): Promise<{ history: WrapperHistory; evidenceId: string } | null> {
  try {
    const { data, evidenceId } = await cmcGetWithEvidence<OhlcvHistorical>(
      "/v2/cryptocurrency/ohlcv/historical",
      {
        id: token.crypto_id,
        time_start: OHLCV_START,
        interval: "1d",
        count: 5000,
        convert: "USD",
      },
    );
    const points = data.quotes
      ?.map((q) => ({
        date: q.quote.USD.timestamp.slice(0, 10),
        close: q.quote.USD.close as number,
      }))
      .filter((p) => typeof p.close === "number" && p.close > 0);
    if (!points || points.length === 0) return null;
    return {
      history: {
        symbol: token.symbol,
        cryptoId: token.crypto_id,
        issuerName: token.issuer_name,
        points,
      },
      evidenceId,
    };
  } catch {
    return null;
  }
}

const historyCache = new Map<string, { expires: number; value: HistoryPayload }>();
const HISTORY_TTL_MS = 15 * 60 * 1000;

/**
 * Builds the premium + cross-wrapper spread history for an asset.
 *
 * The spread series is the product's most defensible chart: both legs are
 * tokenised claims on the same instrument, so dividends, share-class and
 * reference-source quirks cancel out. What remains is pure wrapper dislocation.
 */
export async function buildHistory(asset: RwaAsset): Promise<HistoryPayload | null> {
  const cacheKey = `${asset.symbol}:${asset.tokens.map((t) => t.crypto_id).join(",")}`;
  const hit = historyCache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.value;

  const tokens = candidateWrappers(asset);
  if (tokens.length === 0) return null;

  const spec = referenceFor(asset.symbol);
  const [wrapperResults, referenceHistory] = await Promise.all([
    Promise.all(tokens.map(fetchWrapperHistory)),
    spec ? fetchReferenceHistory(spec) : Promise.resolve(null),
  ]);

  const wrappers = wrapperResults
    .filter((r): r is NonNullable<typeof r> => r != null)
    .map((r) => r.history);
  if (wrappers.length === 0) return null;

  const evidenceIds = wrapperResults
    .filter((r): r is NonNullable<typeof r> => r != null)
    .map((r) => r.evidenceId);

  const closes = referenceHistory?.closes ?? {};
  const allDates = Array.from(new Set(wrappers.flatMap((w) => w.points.map((p) => p.date)))).sort();

  const premiums: PremiumSeries[] = [];
  const weekdayAbs: number[] = [];
  const weekendAbs: number[] = [];
  let worstPremium: { date: string; premiumPct: number; symbol: string } | null = null;

  if (referenceHistory && Object.keys(closes).length > 0) {
    const filled = forwardFill(allDates, closes);
    for (const wrapper of wrappers) {
      const points: { date: string; value: number }[] = [];
      for (const p of wrapper.points) {
        const ref = filled[p.date];
        if (!ref) continue;
        const value = (p.close / ref - 1) * 100;
        points.push({ date: p.date, value });
        if (isWeekend(p.date)) weekendAbs.push(Math.abs(value));
        else weekdayAbs.push(Math.abs(value));
        if (!worstPremium || Math.abs(value) > Math.abs(worstPremium.premiumPct)) {
          worstPremium = { date: p.date, premiumPct: value, symbol: wrapper.symbol };
        }
      }
      if (points.length > 0) premiums.push({ symbol: wrapper.symbol, points });
    }
  }

  // Cross-wrapper spreads for every unique pair — usually 1–6 pairs.
  const spreads: SpreadSeries[] = [];
  for (let i = 0; i < wrappers.length; i += 1) {
    for (let j = i + 1; j < wrappers.length; j += 1) {
      const base = wrappers[i];
      const quote = wrappers[j];
      const quoteMap = new Map(quote.points.map((p) => [p.date, p.close]));
      const points = base.points
        .map((p) => {
          const other = quoteMap.get(p.date);
          if (!other) return null;
          return { date: p.date, bps: (p.close / other - 1) * 10_000 };
        })
        .filter((p): p is { date: string; bps: number } => p != null);
      if (points.length > 5) spreads.push({ base: base.symbol, quote: quote.symbol, points });
    }
  }

  let maxAbsSpreadBps: number | null = null;
  let worstSpread: HistoryStats["worstSpread"] = null;
  let episodeCount = 0;
  for (const series of spreads) {
    for (const p of series.points) {
      if (maxAbsSpreadBps == null || Math.abs(p.bps) > Math.abs(maxAbsSpreadBps)) {
        maxAbsSpreadBps = p.bps;
      }
      if (!worstSpread || Math.abs(p.bps) > Math.abs(worstSpread.bps)) {
        worstSpread = { date: p.date, bps: p.bps, base: series.base, quote: series.quote };
      }
      if (Math.abs(p.bps) > 100) episodeCount += 1;
    }
  }

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  const payload: HistoryPayload = {
    symbol: asset.symbol,
    referenceSymbol: referenceHistory?.symbol ?? null,
    wrappers,
    premiums,
    spreads,
    stats: {
      windowStart: allDates[0] ?? null,
      windowEnd: allDates[allDates.length - 1] ?? null,
      wrapperCount: wrappers.length,
      maxAbsSpreadBps,
      spreadPair:
        spreads.length > 0 ? { base: spreads[0].base, quote: spreads[0].quote } : null,
      weekendMeanAbsPremiumPct: mean(weekendAbs),
      weekdayMeanAbsPremiumPct: mean(weekdayAbs),
      worstSpread,
      worstPremium,
      episodeCount,
    },
    weekendDates: allDates.filter(isWeekend),
    evidenceIds,
    generatedAt: new Date().toISOString(),
  };

  historyCache.set(cacheKey, { expires: Date.now() + HISTORY_TTL_MS, value: payload });
  return payload;
}

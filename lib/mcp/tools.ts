import { getAsset, getAssetRaw, getScreenerCached, searchAssets } from "@/lib/services/assets";
import { buildHistory } from "@/lib/verdict/history";
import { fmtBps, fmtPct, fmtPrice } from "@/lib/format";

/**
 * The five tools Parity exposes to AI agents. Each handler is total: domain
 * problems (unknown ticker, no data) come back as tool-level `isError`
 * results, never as thrown protocol errors.
 */

export interface ToolResult {
  /** Short human-readable summary (goes in `content[0].text`). */
  summary: string;
  /** Machine-readable payload (goes in `structuredContent`). */
  data: Record<string, unknown>;
  isError?: boolean;
}

export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}

const SYMBOL_RE = /^[A-Za-z0-9.$-]{1,12}$/;

function cleanSymbol(raw: unknown): string {
  if (typeof raw !== "string" || !SYMBOL_RE.test(raw.trim())) {
    throw new ToolError(
      `Invalid symbol ${JSON.stringify(raw)} — use a tokenised ticker like "NVDA", "SPY" or "GOLD".`,
    );
  }
  return raw.trim().toUpperCase();
}

function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : fallback;
  return Math.min(max, Math.max(min, n));
}

async function fairValue(args: Record<string, unknown>): Promise<ToolResult> {
  const symbol = cleanSymbol(args.symbol);
  const payload = await getAsset(symbol).catch(() => null);
  if (!payload) {
    throw new ToolError(
      `No tokenised asset found for "${symbol}". Try NVDA, AAPL, SPY, GOLD, MSTR or search first with parity_search.`,
    );
  }
  const v = payload.verdict;
  const ref = v.reference;
  const data = {
    symbol: v.symbol,
    name: v.name,
    verdict: v.verdict,
    confidence: v.confidence,
    premium_pct: v.premiumPct,
    spread_bps: v.spreadBps,
    blended_price: v.price,
    best_wrapper: v.best
      ? { symbol: v.best.symbol, issuer: v.best.issuerName, price: v.best.adjustedPrice ?? v.best.price }
      : null,
    worst_wrapper: v.worst
      ? { symbol: v.worst.symbol, issuer: v.worst.issuerName, price: v.worst.adjustedPrice ?? v.worst.price }
      : null,
    reference: ref
      ? {
          symbol: ref.symbol,
          price: ref.price,
          label: ref.priceLabel,
          session: ref.session,
          age_hours: Math.round(ref.ageHours * 10) / 10,
          stale: ref.stale,
        }
      : null,
    headline: v.copy.headline,
    detail: v.copy.detail,
    drivers: v.drivers.slice(0, 6),
    inspect_in_app: `/asset/${v.symbol}`,
  };
  const summary = [
    `${v.symbol} (${v.name}): ${v.copy.headline}.`,
    v.premiumPct != null ? `Blended premium ${fmtPct(v.premiumPct)}.` : null,
    v.best ? `Cheapest route: ${v.best.symbol} at ${fmtPrice(v.best.adjustedPrice ?? v.best.price)}.` : null,
    v.spreadBps != null && v.spreadBps > 0 ? `Wrapper gap ${fmtBps(v.spreadBps)}.` : null,
    ref ? `Reference ${ref.symbol} ${fmtPrice(ref.price)} (${ref.priceLabel}, ${ref.session}).` : "No TradFi reference mapped.",
    `Confidence: ${v.confidence}.`,
  ]
    .filter(Boolean)
    .join(" ");
  return { summary, data };
}

async function spread(args: Record<string, unknown>): Promise<ToolResult> {
  const symbol = cleanSymbol(args.symbol);
  const payload = await getAsset(symbol).catch(() => null);
  if (!payload) {
    throw new ToolError(`No tokenised asset found for "${symbol}".`);
  }
  const v = payload.verdict;
  const rows = v.wrappers.map((w) => ({
    symbol: w.symbol,
    issuer: w.issuerName,
    price: w.rawPrice,
    adjusted_price: w.adjustedPrice,
    accrued_yield_pct:
      w.accruedYieldPct != null ? Math.round(w.accruedYieldPct * 100) / 100 : null,
    spread_bps_vs_best: w.spreadBpsVsBest,
    volume_24h: w.volume24h,
    included: w.included,
    excluded_reason: w.excludedReason,
  }));
  const data = {
    symbol: v.symbol,
    spread_bps: v.spreadBps,
    dispersion_pct: v.dispersionPct,
    best: v.best?.symbol ?? null,
    worst: v.worst?.symbol ?? null,
    wrappers: rows.slice(0, 12),
    note: "Prices are accrual-adjusted where total-return wrappers carry reinvested dividends; raw and adjusted figures are both shown.",
  };
  const summary =
    `Cross-wrapper ranking for ${v.symbol}: ` +
    rows
      .filter((r) => r.price != null)
      .slice(0, 6)
      .map(
        (r) =>
          `${r.symbol} ${fmtPrice(r.adjusted_price ?? r.price)}${r.accrued_yield_pct ? ` (incl. +${r.accrued_yield_pct}% accrued)` : ""}`,
      )
      .join(" · ") +
    (v.spreadBps != null ? `. Gap ${fmtBps(v.spreadBps)}.` : ".");
  return { summary, data };
}

async function screener(args: Record<string, unknown>): Promise<ToolResult> {
  const limit = clampInt(args.limit, 10, 1, 25);
  const minVolume = clampInt(args.min_volume_usd ?? 100_000, 100_000, 0, 100_000_000);
  const payload = await getScreenerCached();
  const rows = payload.rows.filter((r) => r.volume24h >= minVolume).slice(0, limit);
  const data = {
    as_of: payload.asOf,
    scanned: payload.scanned,
    rows: rows.map((r) => ({
      symbol: r.symbol,
      name: r.name,
      spread_bps: r.spreadBps,
      cheaper_leg: r.bestSymbol,
      dearer_leg: r.worstSymbol,
      legs_disagree: r.legsDisagree,
      accrual_adjusted: r.accrualApplied,
      volume_24h: Math.round(r.volume24h),
    })),
  };
  const summary =
    rows.length === 0
      ? "No dislocations above the volume bar right now."
      : `Top wrapper dislocations (scanned ${payload.scanned} assets): ` +
        rows.map((r) => `${r.symbol} ${fmtBps(r.spreadBps)} (${r.bestSymbol} vs ${r.worstSymbol})`).join(" · ") +
        ".";
  return { summary, data };
}

async function history(args: Record<string, unknown>): Promise<ToolResult> {
  const symbol = cleanSymbol(args.symbol);
  const asset = await getAssetRaw(symbol).catch(() => null);
  if (!asset) throw new ToolError(`No tokenised asset found for "${symbol}".`);
  const h = await buildHistory(asset).catch(() => null);
  if (!h || h.spreads.length === 0) {
    throw new ToolError(`Not enough wrapper history for ${symbol} yet.`);
  }
  const primary = h.spreads.reduce((best, s) => (s.points.length > best.points.length ? s : best), h.spreads[0]);
  const tail = primary.points.slice(-30).map((p) => ({ date: p.date, spread_bps: Math.round(p.bps) }));
  const data = {
    symbol: h.symbol,
    window: { start: h.stats.windowStart, end: h.stats.windowEnd },
    wrappers: h.wrappers.map((w) => w.symbol),
    weekend_mean_abs_premium_pct: h.stats.weekendMeanAbsPremiumPct,
    weekday_mean_abs_premium_pct: h.stats.weekdayMeanAbsPremiumPct,
    worst_spread: h.stats.worstSpread,
    worst_premium: h.stats.worstPremium,
    episodes_over_100bps: h.stats.episodeCount,
    recent_spread_bps: tail,
  };
  const s = h.stats;
  const summary =
    `${symbol} dislocation history (${s.windowStart} → ${s.windowEnd}): ` +
    `weekends average ${s.weekendMeanAbsPremiumPct?.toFixed(2) ?? "—"}% absolute premium vs ` +
    `${s.weekdayMeanAbsPremiumPct?.toFixed(2) ?? "—"}% on weekdays; ` +
    `${s.episodeCount} episodes over 100 bps; ` +
    (s.worstPremium
      ? `worst premium ${fmtPct(s.worstPremium.premiumPct)} (${s.worstPremium.symbol}, ${s.worstPremium.date}).`
      : "no major episodes.");
  return { summary, data };
}

async function search(args: Record<string, unknown>): Promise<ToolResult> {
  const query = typeof args.query === "string" ? args.query.trim().slice(0, 40) : "";
  if (!query) throw new ToolError('Pass a "query" string, e.g. {"query": "nvidia"}.');
  const results = await searchAssets(query);
  const data = {
    query,
    results: results.map((r) => ({
      symbol: r.symbol,
      name: r.name,
      asset_type: r.assetType,
      has_reference: r.hasReference,
      inspect_in_app: `/asset/${r.symbol}`,
    })),
  };
  const summary =
    results.length === 0
      ? `No tokenised assets match "${query}".`
      : `Matches for "${query}": ` + results.map((r) => `${r.symbol} (${r.name})`).join(" · ") + ".";
  return { summary, data };
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export const TOOLS: ToolDefinition[] = [
  {
    name: "parity_fair_value",
    description:
      "Fair-value verdict for a tokenised stock, ETF or commodity: blended premium vs the underlying instrument, cheapest wrapper, wrapper gap, reference freshness and confidence. Dividend accrual on total-return wrappers is stripped before comparison.",
    inputSchema: {
      type: "object",
      properties: { symbol: { type: "string", description: 'Tokenised ticker, e.g. "NVDA", "SPY", "GOLD".' } },
      required: ["symbol"],
      additionalProperties: false,
    },
    handler: fairValue,
  },
  {
    name: "parity_spread",
    description:
      "Rank every wrapper (issuer token) for one asset by accrual-adjusted price, with raw vs adjusted figures, accrued yield, volumes and exclusion reasons.",
    inputSchema: {
      type: "object",
      properties: { symbol: { type: "string", description: "Tokenised ticker." } },
      required: ["symbol"],
      additionalProperties: false,
    },
    handler: spread,
  },
  {
    name: "parity_screener",
    description:
      "Top cross-wrapper dislocations across the RWA universe, ranked by spread in bps. Needs no external reference. Flags rows where legs disagree or accrual could not be resolved.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Rows to return (1-25).", default: 10 },
        min_volume_usd: { type: "number", description: "Minimum combined 24h volume.", default: 100000 },
      },
      additionalProperties: false,
    },
    handler: screener,
  },
  {
    name: "parity_history",
    description:
      "Dislocation history for one asset: weekend vs weekday dislocation, worst spread and premium episodes, and the recent spread series. Built from wrapper OHLCV joined against the underlying.",
    inputSchema: {
      type: "object",
      properties: { symbol: { type: "string", description: "Tokenised ticker." } },
      required: ["symbol"],
      additionalProperties: false,
    },
    handler: history,
  },
  {
    name: "parity_search",
    description: "Find tokenised assets by ticker, name or slug.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: 'Free text, e.g. "nvidia" or "gold".' } },
      required: ["query"],
      additionalProperties: false,
    },
    handler: search,
  },
];

export const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]));

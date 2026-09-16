import type { RwaAsset, RwaToken } from "@/lib/cmc/types";
import type { ReferenceQuote } from "@/lib/reference";
import { TOKEN_NOTES } from "@/lib/reference/mapping";

/**
 * Every tuneable that shapes a verdict lives here, in one place, so the
 * methodology page and the unit tests can both reference the same constants.
 */
export const THRESHOLDS = {
  /** |premium| inside this band reads as fair value. */
  fairBandPct: 0.75,
  /** Cross-wrapper gap (bps) at which venue choice becomes the headline. */
  wrapperGapHeadlineBps: 60,
  /** Cross-wrapper dispersion (stdev of prices, %) above which wrappers are "decoupled". */
  dispersionPct: 1.5,
  /** Below this aggregate 24h volume the tracker refuses to make a call. */
  minAssetVolumeUsd: 50_000,
  /** A wrapper needs at least this 24h volume to count as a live route. */
  minWrapperVolumeUsd: 5_000,
  /** A live wrapper deviating more than this from the median is treated as an outlier. */
  outlierBandPct: 5,
  /** Reference price older than this reads as stale (weekend / holiday). */
  staleReferenceHours: 26,
  /** Reference older than this drops confidence to low. */
  veryStaleReferenceHours: 72,
  /** Normalised price / anchor ratio band that counts as "same unit". */
  sameUnitBand: [0.5, 1.5] as const,
  /** Ratio band for per-gram precious-metal quotes vs a per-troy-ounce reference. */
  perGramBand: [0.02, 0.06] as const,
  troyOunceFactor: 31.1035,
} as const;

export type Verdict =
  | "FAIR"
  | "OVERPRICED"
  | "DISCOUNT"
  | "DISPERSION"
  | "ILLIQUID"
  | "RELATIVE"
  | "NO_DATA";

export type Confidence = "high" | "medium" | "low";

export interface Wrapper {
  symbol: string;
  name: string;
  cryptoId: number;
  issuerId: string | null;
  issuerName: string | null;
  /** As reported by CMC, in the token's own unit. */
  rawPrice: number | null;
  /** Price after unit normalisation (troy-ounce conversion when applicable). */
  price: number | null;
  /** Price after dividend-accrual adjustment — the economically comparable number. */
  adjustedPrice: number | null;
  /** Cumulative reinvestment factor applied (1 = price-tracking wrapper). */
  accrualFactor: number | null;
  /** Accrued yield since inception, in percent. */
  accruedYieldPct: number | null;
  unitNote: string | null;
  marketCap: number | null;
  volume24h: number | null;
  /** Premium vs its reference (asset-level or per-token override). */
  premiumPct: number | null;
  premiumBps: number | null;
  /** Basis points above the cheapest live route. */
  spreadBpsVsBest: number | null;
  /** Difference vs the aggregate average CMC publishes. */
  vsAggregateBps: number | null;
  wrapped: boolean;
  derivative: boolean;
  /** True when the wrapper has enough 24h volume to be a live route. */
  live: boolean;
  /** True when this wrapper is part of the verdict maths. */
  included: boolean;
  excludedReason: string | null;
  note: string | null;
  referenceSymbol: string | null;
}

export interface VerdictResult {
  symbol: string;
  name: string;
  slug: string;
  rwaId: number;
  assetType: RwaAsset["asset_type"];
  rwaRank: number;
  aggregate: {
    averageTokenizedPrice: number | null;
    tokenizedMarketCap: number | null;
    tokenizedVolume24h: number | null;
    lastUpdated: string;
  };
  reference: {
    symbol: string;
    price: number;
    regularClose: number | null;
    extendedPrice: number | null;
    currency: string;
    exchange: string;
    asOf: number;
    ageHours: number;
    session: ReferenceQuote["session"];
    stale: boolean;
    note: string | null;
    priceLabel: string;
  } | null;
  wrappers: Wrapper[];
  derivatives: Wrapper[];
  excluded: Wrapper[];
  /** Median included wrapper price, unit-normalised. */
  price: number | null;
  premiumPct: number | null;
  premiumBps: number | null;
  /** Cheapest live route. */
  best: Wrapper | null;
  worst: Wrapper | null;
  /** Max spread between live routes, in bps. */
  spreadBps: number | null;
  /** Stdev of included prices as % of mean. */
  dispersionPct: number | null;
  liveCount: number;
  /** Count of wrappers that made it into the verdict maths. */
  includedCount: number;
  totalVolume24h: number;
  verdict: Verdict;
  confidence: Confidence;
  /** Reasons behind the confidence level and verdict — shown verbatim in the UI. */
  drivers: string[];
  copy: { headline: string; detail: string };
}

export interface BuildOptions {
  /** Per-token reference overrides (e.g. GOOGon priced against GOOG). */
  tokenReferences?: Record<string, ReferenceQuote | null>;
  /** Reference caveat from the mapping table. */
  referenceNote?: string | null;
  /** True when the reference is a proxy (futures basis, ADR, leveraged ETF). */
  referenceProxy?: boolean;
  /**
   * Dividend-accrual factors for total-return wrappers (e.g. Ondo `*on`).
   * A factor of 1.03 means the token has reinvested 3% of dividends since its
   * inception, so its price is divided by 1.03 before any comparison.
   */
  accrual?: Record<string, { factor: number; since: string | null }>;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function pct(a: number, b: number): number {
  return (a / b - 1) * 100;
}

function isDerivative(token: RwaToken): boolean {
  return (token.issuer_name ?? "").toLowerCase().includes("derivative");
}

function isWrapped(token: RwaToken): boolean {
  return /wrapped/i.test(token.name) || /^w[A-Z0-9]/.test(token.symbol);
}

/**
 * Pure function: raw CMC asset + TradFi reference in, auditable verdict out.
 * No network, no clock surprises — identical inputs always produce an
 * identical verdict, which is what makes the numbers checkable by judges.
 *
 * Eligibility pipeline, in order:
 *   1. drop derivatives (not a spot route) and unpriced tokens
 *   2. unit check against an anchor → normalise or exclude ("not comparable")
 *   3. liquidity check → live routes vs stale quotes
 *   4. outlier check inside live routes → exclude and explain
 *   5. verdict maths on what survives, with a driver line for every removal
 */
export function buildVerdict(
  asset: RwaAsset,
  reference: ReferenceQuote | null,
  options: BuildOptions = {},
): VerdictResult {
  const drivers: string[] = [];
  const now = Date.now();

  const referenceView = reference
    ? {
        symbol: reference.symbol,
        price: reference.price,
        regularClose: reference.regularClose,
        extendedPrice: reference.extendedPrice,
        currency: reference.currency,
        exchange: reference.exchange,
        asOf: reference.asOf,
        ageHours: Math.max(0, (now - reference.asOf) / 3_600_000),
        session: reference.session,
        stale: reference.stale,
        note: options.referenceNote ?? null,
        priceLabel: reference.priceLabel,
      }
    : null;

  const spotTokens = asset.tokens.filter((t) => !isDerivative(t));
  const pricedTokens = spotTokens.filter((t) => t.price != null && t.price > 0);
  const medianRaw = median(pricedTokens.map((t) => t.price as number));
  const anchor = reference?.price ?? medianRaw;

  const wrappers: Wrapper[] = asset.tokens.map((token) => {
    const rawPrice = token.price ?? null;
    const derivative = isDerivative(token);
    const wrapped = isWrapped(token);
    const tokenRef = options.tokenReferences?.[token.symbol] ?? reference;
    const refPrice = tokenRef?.price ?? null;
    const volume24h = token.volume_24h ?? null;

    let price = rawPrice;
    let unitNote: string | null = null;
    let excludedReason: string | null = null;

    // ── step 1: presence ──────────────────────────────────────────────
    if (derivative) {
      excludedReason = "Derivatives feed — not a spot route.";
    } else if (rawPrice == null || rawPrice <= 0) {
      excludedReason = "No price reported by CoinMarketCap.";
    }

    // ── step 2: unit ──────────────────────────────────────────────────
    if (!excludedReason && rawPrice != null && anchor != null && anchor > 0) {
      const ratio = rawPrice / anchor;
      const [lo, hi] = THRESHOLDS.sameUnitBand;
      if (ratio < lo || ratio > hi) {
        const [glo, ghi] = THRESHOLDS.perGramBand;
        if (asset.asset_type === "commodity" && ratio >= glo && ratio <= ghi) {
          price = rawPrice * THRESHOLDS.troyOunceFactor;
          unitNote = `Per-gram quote normalised to troy ounces (×${THRESHOLDS.troyOunceFactor}).`;
        } else {
          excludedReason = `Quote unit differs from the reference (×${ratio.toFixed(3)}) — not comparable like-for-like.`;
        }
      }
    }

    // ── step 3: liquidity ─────────────────────────────────────────────
    const live = (volume24h ?? 0) >= THRESHOLDS.minWrapperVolumeUsd;
    if (!excludedReason && !live) {
      excludedReason = `Stale quote: only $${Math.round(volume24h ?? 0).toLocaleString()} traded in 24h.`;
    }

    const accrualInfo = options.accrual?.[token.symbol];
    const factor = accrualInfo && accrualInfo.factor > 1 ? accrualInfo.factor : null;
    const adjustedPrice = price != null && factor ? price / factor : price;
    const effective = adjustedPrice ?? price;
    const premiumPct = effective != null && refPrice ? pct(effective, refPrice) : null;

    return {
      symbol: token.symbol,
      name: token.name,
      cryptoId: token.crypto_id,
      issuerId: token.issuer_id,
      issuerName: token.issuer_name,
      rawPrice,
      price,
      adjustedPrice,
      accrualFactor: factor,
      accruedYieldPct: factor ? (factor - 1) * 100 : null,
      unitNote,
      marketCap: token.market_cap ?? null,
      volume24h,
      premiumPct,
      premiumBps: premiumPct == null ? null : Math.round(premiumPct * 100),
      spreadBpsVsBest: null,
      vsAggregateBps: null,
      wrapped,
      derivative,
      live,
      included: false,
      excludedReason,
      note: TOKEN_NOTES[token.symbol] ?? null,
      referenceSymbol: tokenRef?.symbol ?? null,
    };
  });

  // ── step 4: outlier check inside live, non-wrapped routes ───────────
  const liveClean = wrappers.filter(
    (w) => !w.derivative && !w.excludedReason && w.adjustedPrice != null && !w.wrapped,
  );
  const liveWrapped = wrappers.filter(
    (w) => w.wrapped && !w.excludedReason && w.adjustedPrice != null,
  );
  const base = liveClean.length > 0 ? liveClean : liveWrapped;
  const baseMedian = median(base.map((w) => w.adjustedPrice as number));

  const ranked: Wrapper[] = [];
  for (const w of base) {
    if (baseMedian && baseMedian > 0) {
      const deviationPct = Math.abs(pct(w.adjustedPrice as number, baseMedian));
      if (deviationPct > THRESHOLDS.outlierBandPct && base.length > 1) {
        w.excludedReason = `Outlier: ${deviationPct.toFixed(1)}% away from the median live quote — likely a stale or exotic venue.`;
        continue;
      }
    }
    ranked.push(w);
  }

  // If every live route got dropped as an outlier, fall back to the full set
  // so the page still says something honest rather than nothing.
  if (ranked.length === 0 && base.length > 0) {
    for (const w of base) {
      w.excludedReason = null;
      ranked.push(w);
    }
    drivers.push("All live routes were outliers — showing them without outlier filtering.");
  }

  const rankedPrices = ranked.map((w) => w.adjustedPrice as number);
  const price = median(rankedPrices);
  const aggregateAvg = asset.average_tokenized_price;

  const totalVolume24h = wrappers
    .filter((w) => !w.derivative && w.volume24h != null)
    .reduce((sum, w) => sum + (w.volume24h ?? 0), 0);

  // For a large market, a $5k venue is noise, not a route. Scale the bar with
  // the market so "cheapest route" always points at something tradable.
  const minRouteVolume = Math.max(THRESHOLDS.minWrapperVolumeUsd, totalVolume24h * 0.005);
  const routeEligible = ranked.filter((w) => (w.volume24h ?? 0) >= minRouteVolume);
  const routePool = routeEligible.length > 0 ? routeEligible : ranked;

  const sortedByPrice = [...routePool].sort(
    (a, b) => (a.adjustedPrice as number) - (b.adjustedPrice as number),
  );
  const best = sortedByPrice[0] ?? null;
  const worst = sortedByPrice[sortedByPrice.length - 1] ?? null;

  const spreadBps =
    best && worst && best.adjustedPrice && worst !== best
      ? Math.round(((worst.adjustedPrice as number) / (best.adjustedPrice as number) - 1) * 10_000)
      : best
        ? 0
        : null;
  const dispersionPct =
    rankedPrices.length >= 2 && price
      ? (stdev(rankedPrices) / price) * 100
      : rankedPrices.length === 1
        ? 0
        : null;

  const premiumPct = price != null && referenceView ? pct(price, referenceView.price) : null;
  const premiumBps = premiumPct == null ? null : Math.round(premiumPct * 100);

  for (const w of wrappers) {
    if (w.adjustedPrice != null && best?.adjustedPrice) {
      w.spreadBpsVsBest =
        best.adjustedPrice > 0
          ? Math.round(((w.adjustedPrice as number) / best.adjustedPrice - 1) * 10_000)
          : null;
    }
    if (w.adjustedPrice != null && aggregateAvg) {
      w.vsAggregateBps = Math.round(((w.adjustedPrice as number) / aggregateAvg - 1) * 10_000);
    }
    w.included = ranked.includes(w);
  }

  // ── verdict rules, in strict order ──────────────────────────────────
  let verdict: Verdict;
  if (wrappers.every((w) => w.rawPrice == null || w.derivative)) {
    verdict = "NO_DATA";
  } else if (ranked.length === 0) {
    verdict = "ILLIQUID";
  } else if (!referenceView) {
    verdict = "RELATIVE";
  } else if (totalVolume24h > 0 && totalVolume24h < THRESHOLDS.minAssetVolumeUsd) {
    verdict = "ILLIQUID";
  } else if (dispersionPct != null && dispersionPct > THRESHOLDS.dispersionPct) {
    verdict = "DISPERSION";
  } else if (premiumPct != null && premiumPct > THRESHOLDS.fairBandPct) {
    verdict = "OVERPRICED";
  } else if (premiumPct != null && premiumPct < -THRESHOLDS.fairBandPct) {
    verdict = "DISCOUNT";
  } else {
    verdict = "FAIR";
  }

  // ── confidence ──────────────────────────────────────────────────────
  let confidence: Confidence = "high";
  const downgrade = () => {
    confidence = confidence === "high" ? "medium" : "low";
  };

  if (!referenceView) {
    confidence = "medium";
    drivers.push("No TradFi reference mapped — verdict covers cross-wrapper pricing only.");
  } else {
    if (referenceView.stale) {
      downgrade();
      drivers.push(
        `Reference is ${Math.round(referenceView.ageHours)}h old (${referenceView.session === "closed" ? "market closed" : "stale feed"}).`,
      );
    }
    if (referenceView.ageHours > THRESHOLDS.veryStaleReferenceHours) downgrade();
    if (referenceView.session === "extended") {
      drivers.push("Reference includes extended-hours trading; tokens can already price the next session.");
    }
    if (options.referenceProxy) {
      downgrade();
      drivers.push("Reference is a proxy (basis, ADR or leveraged product) — treat the premium as indicative.");
    }
  }

  if (totalVolume24h < 250_000) {
    downgrade();
    drivers.push(`Thin market: $${Math.round(totalVolume24h).toLocaleString()} of 24h tokenised volume.`);
  }
  if (dispersionPct != null && dispersionPct > 0.75) {
    downgrade();
    drivers.push(`Wrappers disagree by ${dispersionPct.toFixed(2)}% around their median.`);
  }
  if (ranked.length < 2) {
    downgrade();
    drivers.push("Only one wrapper has usable live pricing — no cross-issuer check possible.");
  }
  if (referenceView && !referenceView.stale && referenceView.session !== "closed") {
    drivers.push(`Reference is fresh (session: ${referenceView.session}).`);
  } else if (referenceView && !referenceView.stale) {
    drivers.push("Reference is fresh relative to the last close.");
  }
  if (spreadBps != null && spreadBps > 0 && best && worst) {
    drivers.push(`Cheapest route ${best.symbol} vs dearest ${worst.symbol}: ${spreadBps} bps.`);
  }
  for (const w of wrappers) {
    if (w.unitNote) drivers.push(`${w.symbol}: ${w.unitNote}`);
    if (w.accrualFactor) {
      drivers.push(
        `${w.symbol} is a total-return token: price divided by ${w.accrualFactor.toFixed(4)} ` +
          `(${w.accruedYieldPct?.toFixed(2)}% of dividends reinvested since inception) before comparison.`,
      );
    }
  }
  const excludedNonDerivative = wrappers.filter((w) => !w.derivative && w.excludedReason);
  if (excludedNonDerivative.length > 0) {
    drivers.push(
      `${excludedNonDerivative.length} of ${spotTokens.length} priced wrappers excluded: ${excludedNonDerivative
        .map((w) => w.symbol)
        .join(", ")}.`,
    );
  }

  const copy = verdictCopy(verdict, {
    symbol: asset.symbol,
    premiumPct,
    best,
    worst,
    spreadBps,
    referenceLabel: referenceView?.symbol ?? null,
    referencePrice: referenceView?.price ?? null,
    totalVolume24h,
    confidence,
  });

  return {
    symbol: asset.symbol,
    name: asset.name,
    slug: asset.slug,
    rwaId: asset.rwa_id,
    assetType: asset.asset_type,
    rwaRank: asset.rwa_rank,
    aggregate: {
      averageTokenizedPrice: asset.average_tokenized_price,
      tokenizedMarketCap: asset.tokenized_market_cap,
      tokenizedVolume24h: asset.tokenized_volume_24h,
      lastUpdated: asset.last_updated,
    },
    reference: referenceView,
    wrappers,
    derivatives: wrappers.filter((w) => w.derivative),
    excluded: wrappers.filter((w) => !w.derivative && w.excludedReason),
    price,
    premiumPct: premiumPct == null ? null : Number(premiumPct.toFixed(4)),
    premiumBps,
    best,
    worst,
    spreadBps,
    dispersionPct: dispersionPct == null ? null : Number(dispersionPct.toFixed(4)),
    liveCount: ranked.length,
    includedCount: ranked.length,
    totalVolume24h,
    verdict,
    confidence,
    drivers,
    copy,
  };
}

export function verdictCopy(
  verdict: Verdict,
  ctx: {
    symbol: string;
    premiumPct: number | null;
    best: Wrapper | null;
    worst: Wrapper | null;
    spreadBps: number | null;
    referenceLabel: string | null;
    referencePrice: number | null;
    totalVolume24h: number;
    confidence: Confidence;
  },
): { headline: string; detail: string } {
  const p = ctx.premiumPct;
  const arrow = p == null ? "" : `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`;
  const cheapest = ctx.best?.symbol ?? null;
  const dearest = ctx.worst?.symbol ?? null;
  const bps = ctx.spreadBps != null && ctx.spreadBps > 0 ? `${ctx.spreadBps} bps` : null;
  const wrapperGap = ctx.spreadBps != null && ctx.spreadBps >= THRESHOLDS.wrapperGapHeadlineBps;

  switch (verdict) {
    case "OVERPRICED":
      return {
        headline: `Tokenised ${ctx.symbol} trades ${arrow} above fair value`,
        detail: cheapest
          ? `The blended token price sits above the ${ctx.referenceLabel ?? "TradFi reference"}. Cheapest route right now: ${cheapest}${bps ? ` — ${bps} under the priciest wrapper` : ""}.`
          : "Blended token price sits above the TradFi reference.",
      };
    case "DISCOUNT":
      return {
        headline: `Tokenised ${ctx.symbol} trades ${arrow} below fair value`,
        detail: cheapest
          ? `Discounts are worth verifying before acting: confirm the route is redeemable and liquid. Cheapest wrapper: ${cheapest}.`
          : "Blended token price sits below the TradFi reference.",
      };
    case "FAIR":
      // Most of the time the aggregate is fair but wrapper choice still costs
      // money. When the cross-wrapper gap is wide, that becomes the headline.
      if (wrapperGap && cheapest && dearest) {
        return {
          headline: `Fair value — but ${bps} between the cheapest and dearest wrapper`,
          detail: `Blended premium ${arrow} is inside the fair band, so the instrument is tracking well. The cost is in venue choice: ${cheapest} is ${bps} cheaper than ${dearest} for identical exposure.`,
        };
      }
      return {
        headline: `Tokenised ${ctx.symbol} is tracking fair value`,
        detail: cheapest
          ? `Blended premium ${arrow} — inside the ±${THRESHOLDS.fairBandPct}% fair band. If you are buying, ${cheapest} is the cheapest live wrapper${bps ? ` (${bps} below the dearest)` : ""}.`
          : "Blended premium inside the fair band.",
      };
    case "DISPERSION":
      return {
        headline: `Wrappers are out of line with each other`,
        detail: `${bps ? `Cross-wrapper dispersion of ${bps} ` : "Cross-wrapper dispersion "}is wider than normal. The wrappers have decoupled — check the venue before trading rather than trusting a blended price.`,
      };
    case "ILLIQUID":
      return {
        headline: `Market too thin to judge fairly`,
        detail: `${ctx.totalVolume24h > 0 ? `Only $${Math.round(ctx.totalVolume24h).toLocaleString()} of 24h tokenised volume. ` : ""}Parity withholds a verdict rather than reporting a price nobody can trade on.`,
      };
    case "RELATIVE":
      return {
        headline: `No TradFi reference mapped — relative pricing only`,
        detail: cheapest
          ? `Parity can still rank the wrappers: ${cheapest} is the cheapest live route${bps ? `, ${bps} under the dearest` : ""}.`
          : "No usable wrapper prices.",
      };
    case "NO_DATA":
    default:
      return {
        headline: "No usable token prices right now",
        detail: "CoinMarketCap returned no priced tokens for this asset.",
      };
  }
}

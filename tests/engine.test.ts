import { describe, expect, it } from "vitest";
import { buildVerdict, THRESHOLDS } from "@/lib/verdict/engine";
import type { RwaAsset, RwaToken } from "@/lib/cmc/types";
import type { ReferenceQuote } from "@/lib/reference";

function token(overrides: Partial<RwaToken> & Pick<RwaToken, "symbol">): RwaToken {
  return {
    name: `${overrides.symbol} token`,
    price: 100,
    crypto_id: Math.floor(Math.random() * 100_000),
    issuer_id: "issuer-1",
    issuer_name: "Backed Assets",
    market_cap: 1_000_000,
    volume_24h: 1_000_000,
    ...overrides,
  };
}

function asset(tokens: RwaToken[], overrides: Partial<RwaAsset> = {}): RwaAsset {
  return {
    name: "Nvidia Corp",
    symbol: "NVDA",
    slug: "nvidia",
    quotes: [],
    rwa_id: 2,
    asset_type: "stock",
    rwa_rank: 2,
    has_tokens: true,
    average_tokenized_price: null,
    tokenized_market_cap: null,
    tokenized_volume_24h: null,
    last_updated: new Date().toISOString(),
    tokens,
    ...overrides,
  };
}

function reference(price: number, overrides: Partial<ReferenceQuote> = {}): ReferenceQuote {
  return {
    symbol: "NVDA",
    price,
    regularClose: price,
    extendedPrice: null,
    previousClose: price,
    dayHigh: null,
    dayLow: null,
    currency: "USD",
    exchange: "NasdaqGS",
    asOf: Date.now() - 5 * 60_000,
    session: "open",
    stale: false,
    source: "yahoo",
    priceLabel: "live regular-session price",
    ...overrides,
  };
}

describe("buildVerdict — unit and instrument hygiene", () => {
  it("normalises per-gram commodity quotes to troy ounces", () => {
    const gold = asset(
      [
        token({ symbol: "PAXG", price: 4330, issuer_name: "Paxos" }),
        token({ symbol: "CGO", price: 139.2, issuer_name: "Comtech Gold", volume_24h: 50_000 }),
      ],
      { symbol: "GOLD", asset_type: "commodity" },
    );
    const result = buildVerdict(gold, reference(4330));
    const cgo = result.wrappers.find((w) => w.symbol === "CGO");
    expect(cgo?.included).toBe(true);
    expect(cgo?.unitNote).toContain("troy ounces");
    expect(cgo?.price).toBeCloseTo(139.2 * THRESHOLDS.troyOunceFactor, 2);
    expect(Math.abs(cgo?.premiumPct ?? 99)).toBeLessThan(0.5);
  });

  it("excludes wrappers quoting a different unit instead of inventing a discount", () => {
    const result = buildVerdict(
      asset([
        token({ symbol: "TSLAX", price: 357.4 }),
        token({ symbol: "TSLA", price: 50.99, issuer_name: "Hyperliquid Assets", volume_24h: 200_000 }),
      ]),
      reference(357.4, { symbol: "TSLA" }),
    );
    const hl = result.wrappers.find((w) => w.issuerName === "Hyperliquid Assets");
    expect(hl?.excludedReason).toContain("unit differs");
    expect(result.best?.symbol).toBe("TSLAX");
  });

  it("treats zero-volume venues as stale quotes, not discounts", () => {
    const result = buildVerdict(
      asset([
        token({ symbol: "AAPLX", price: 332.3, volume_24h: 3_100_000 }),
        token({ symbol: "AAPL", price: 320.6, issuer_name: "Hyperliquid Assets", volume_24h: 0 }),
      ]),
      reference(332.4, { symbol: "AAPL" }),
    );
    const hl = result.wrappers.find((w) => w.issuerName === "Hyperliquid Assets");
    expect(hl?.included).toBe(false);
    expect(hl?.excludedReason).toContain("Stale quote");
    expect(result.verdict).toBe("FAIR");
  });

  it("drops live but wildly off-median routes as outliers", () => {
    const result = buildVerdict(
      asset([
        token({ symbol: "A", price: 100, volume_24h: 1_000_000 }),
        token({ symbol: "B", price: 100.2, volume_24h: 1_000_000 }),
        token({ symbol: "WEIRD", price: 118, volume_24h: 900_000 }),
      ]),
      reference(100, { symbol: "X" }),
    );
    const weird = result.wrappers.find((w) => w.symbol === "WEIRD");
    expect(weird?.excludedReason).toContain("Outlier");
    expect(result.best?.symbol).toBe("A");
  });

  it("excludes tokens with no reported price", () => {
    const result = buildVerdict(
      asset([
        token({ symbol: "NVDAX", price: 213.8 }),
        token({ symbol: "NVDA.D", price: null, issuer_name: "Dinari Assets" }),
      ]),
      reference(213.8),
    );
    const dinari = result.wrappers.find((w) => w.symbol === "NVDA.D");
    expect(dinari?.included).toBe(false);
    expect(dinari?.excludedReason).toContain("No price");
  });

  it("separates derivatives from spot routes", () => {
    const result = buildVerdict(
      asset([
        token({ symbol: "NVDAX", price: 213.8 }),
        token({ symbol: "NVDA", price: 213.7, issuer_name: "NA (Derivatives)" }),
      ]),
      reference(213.8),
    );
    expect(result.derivatives).toHaveLength(1);
    expect(result.wrappers.find((w) => w.symbol === "NVDA" && w.derivative)?.included).toBe(false);
  });
});

describe("buildVerdict — verdict rules", () => {
  it("returns OVERPRICED when the blended price sits above the fair band", () => {
    const result = buildVerdict(
      asset([token({ symbol: "SPYon", price: 764.6 }), token({ symbol: "SPYX", price: 762.1 })]),
      reference(757.4),
    );
    expect(result.verdict).toBe("OVERPRICED");
    expect(result.copy.headline).toContain("above fair value");
    expect(result.premiumBps).toBeGreaterThan(0);
  });

  it("returns DISCOUNT when the blended price sits below the fair band", () => {
    const result = buildVerdict(
      asset([token({ symbol: "AAPLX", price: 320 }), token({ symbol: "AAPLon", price: 320.2 })]),
      reference(332),
    );
    expect(result.verdict).toBe("DISCOUNT");
  });

  it("returns FAIR when inside the band", () => {
    const result = buildVerdict(
      asset([token({ symbol: "AAPLX", price: 332 }), token({ symbol: "AAPLon", price: 332.4 })]),
      reference(332),
    );
    expect(result.verdict).toBe("FAIR");
  });

  it("flags DISPERSION when wrappers decouple beyond the threshold", () => {
    const result = buildVerdict(
      asset([token({ symbol: "SPYX", price: 762 }), token({ symbol: "SPYon", price: 780 })]),
      reference(760),
    );
    expect(result.verdict).toBe("DISPERSION");
    expect(result.dispersionPct).toBeGreaterThan(1.5);
  });

  it("withholds a verdict when the market is too thin", () => {
    const result = buildVerdict(
      asset([
        token({ symbol: "TINY", price: 10, volume_24h: 100 }),
        token({ symbol: "TINY2", price: 10.1, volume_24h: 200 }),
      ]),
      reference(10),
    );
    expect(result.verdict).toBe("ILLIQUID");
  });

  it("falls back to RELATIVE ranking with no reference", () => {
    const result = buildVerdict(
      asset([token({ symbol: "SPCXb", price: 556.1 }), token({ symbol: "SPCXx", price: 610.4 })]),
      null,
    );
    expect(result.verdict).toBe("RELATIVE");
    expect(result.best?.symbol).toBe("SPCXb");
    expect(result.drivers.join(" ")).toContain("No TradFi reference");
  });

  it("returns NO_DATA when nothing is priced", () => {
    const result = buildVerdict(asset([token({ symbol: "X", price: null })]), null);
    expect(result.verdict).toBe("NO_DATA");
    expect(result.copy.headline).toContain("No usable token prices");
  });
});

describe("buildVerdict — routing and confidence", () => {
  it("prefers a liquid route over a cheaper illiquid one", () => {
    const result = buildVerdict(
      asset([
        token({ symbol: "CHEAP", price: 213.0, volume_24h: 100 }),
        token({ symbol: "LIQUID", price: 213.9, volume_24h: 5_000_000 }),
      ]),
      reference(213.9),
    );
    expect(result.best?.symbol).toBe("LIQUID");
  });

  it("downgrades confidence on a stale reference", () => {
    const result = buildVerdict(
      asset([token({ symbol: "AAPLX", price: 332 }), token({ symbol: "AAPLon", price: 332.1 })]),
      reference(332, {
        asOf: Date.now() - 40 * 3_600_000,
        stale: true,
        session: "closed",
      }),
    );
    expect(result.confidence).not.toBe("high");
    expect(result.drivers.join(" ")).toContain("Reference is");
  });

  it("ranks wrapped tokens only when no primary issuance prices", () => {
    const result = buildVerdict(
      asset([token({ symbol: "WNVDAX", price: 213.5, name: "Wrapped NVIDIA Tokenized stock (xStock)" })]),
      reference(213.8),
    );
    expect(result.best?.symbol).toBe("WNVDAX");
  });

  it("computes spread in bps between best and worst eligible routes", () => {
    const result = buildVerdict(
      asset([
        token({ symbol: "A", price: 100 }),
        token({ symbol: "B", price: 100.5 }),
        token({ symbol: "C", price: 101 }),
      ]),
      reference(100),
    );
    expect(result.spreadBps).toBe(100);
    expect(result.best?.symbol).toBe("A");
    expect(result.worst?.symbol).toBe("C");
  });

  it("explains every exclusion in the driver list", () => {
    const result = buildVerdict(
      asset([
        token({ symbol: "NVDAX", price: 213.8 }),
        token({ symbol: "NVDA.D", price: null, issuer_name: "Dinari Assets" }),
      ]),
      reference(213.8),
    );
    expect(result.drivers.some((d) => d.includes("excluded") && d.includes("NVDA.D"))).toBe(true);
  });
});

describe("buildVerdict — dividend accrual", () => {
  it("strips accrued yield from total-return wrappers before ranking", () => {
    // NVDAon carries ~0.25% of reinvested dividends; NVDAB tracks price.
    const result = buildVerdict(
      asset([
        token({ symbol: "NVDAB", price: 213.36 }),
        token({ symbol: "NVDAon", price: 213.77 }),
      ]),
      reference(213.8, { symbol: "NVDA" }),
      { accrual: { NVDAon: { factor: 1.0025, since: "2025-09-04" } } },
    );
    const ondo = result.wrappers.find((w) => w.symbol === "NVDAon");
    expect(ondo?.accruedYieldPct).toBeCloseTo(0.25, 2);
    expect(ondo?.adjustedPrice).toBeCloseTo(213.77 / 1.0025, 2);
    // after the adjustment Ondo is genuinely cheaper than the tracker
    expect(result.best?.symbol).toBe("NVDAon");
    expect(
      result.drivers.some((d) => d.includes("NVDAon") && d.includes("total-return")),
    ).toBe(true);
  });

  it("does not mistake accrued yield for a wrapper gap on high-yield names", () => {
    // F pays ~4.6% annually; a 3.3% raw gap that is all accrual must vanish.
    const result = buildVerdict(
      asset([
        token({ symbol: "F", price: 13.55 }),
        token({ symbol: "Fon", price: 13.99 }),
      ]),
      reference(13.5, { symbol: "F" }),
      { accrual: { Fon: { factor: 1.033, since: "2026-01-09" } } },
    );
    expect(result.spreadBps).toBeLessThan(150);
    expect(result.best?.symbol).toBe("Fon");
  });

  it("leaves price-tracking wrappers untouched when no accrual is passed", () => {
    const result = buildVerdict(
      asset([token({ symbol: "A", price: 100 }), token({ symbol: "B", price: 100.5 })]),
      reference(100, { symbol: "X" }),
    );
    expect(result.wrappers.every((w) => w.accrualFactor === null)).toBe(true);
    expect(result.best?.symbol).toBe("A");
  });
});

/**
 * Curated map from CoinMarketCap RWA asset symbol → TradFi reference instrument.
 *
 * Why curated instead of automatic: the reference must be the *same instrument
 * and the same unit* as the tokenised claim (same share class, same lot size,
 * same currency). Automatic symbol matching would silently compare Nvidia
 * tokens to, say, a leveraged ETF that happens to share a ticker prefix.
 *
 * Anything not listed here falls back to symbol identity, and the verdict
 * engine refuses to price a comparison it cannot trust.
 */

export type ReferenceKind = "equity" | "etf" | "futures";

export interface ReferenceSpec {
  /** Yahoo Finance ticker for the reference instrument. */
  yahoo: string;
  kind: ReferenceKind;
  /** Human label shown next to the number, e.g. "NasdaqGS". */
  label: string;
  /** Honest caveats surfaced in the UI. */
  note?: string;
  /**
   * True when the reference is a proxy for the tokenised instrument rather
   * than the exact same thing: futures basis, ADR vs local listing, leveraged
   * ETF reset. Proxies cap the verdict's confidence.
   */
  proxy?: boolean;
}

export const REFERENCE_MAP: Record<string, ReferenceSpec> = {
  // ── Mega-cap equities ────────────────────────────────────────────────
  NVDA: { yahoo: "NVDA", kind: "equity", label: "Nasdaq · NVDA" },
  AAPL: { yahoo: "AAPL", kind: "equity", label: "Nasdaq · AAPL" },
  MSFT: { yahoo: "MSFT", kind: "equity", label: "Nasdaq · MSFT" },
  GOOGL: { yahoo: "GOOGL", kind: "equity", label: "Nasdaq · GOOGL" },
  AMZN: { yahoo: "AMZN", kind: "equity", label: "Nasdaq · AMZN" },
  META: { yahoo: "META", kind: "equity", label: "Nasdaq · META" },
  TSLA: { yahoo: "TSLA", kind: "equity", label: "Nasdaq · TSLA" },
  AVGO: { yahoo: "AVGO", kind: "equity", label: "Nasdaq · AVGO" },
  AMD: { yahoo: "AMD", kind: "equity", label: "Nasdaq · AMD" },
  MU: { yahoo: "MU", kind: "equity", label: "Nasdaq · MU" },
  INTC: { yahoo: "INTC", kind: "equity", label: "Nasdaq · INTC" },
  SNDK: { yahoo: "SNDK", kind: "equity", label: "Nasdaq · SNDK" },
  NFLX: { yahoo: "NFLX", kind: "equity", label: "Nasdaq · NFLX" },
  PLTR: { yahoo: "PLTR", kind: "equity", label: "Nasdaq · PLTR" },
  MRVL: { yahoo: "MRVL", kind: "equity", label: "Nasdaq · MRVL" },
  ORCL: { yahoo: "ORCL", kind: "equity", label: "NYSE · ORCL" },
  IBM: { yahoo: "IBM", kind: "equity", label: "NYSE · IBM" },
  QCOM: { yahoo: "QCOM", kind: "equity", label: "Nasdaq · QCOM" },
  AMAT: { yahoo: "AMAT", kind: "equity", label: "Nasdaq · AMAT" },
  SMCI: { yahoo: "SMCI", kind: "equity", label: "Nasdaq · SMCI" },
  ADBE: { yahoo: "ADBE", kind: "equity", label: "Nasdaq · ADBE" },
  COST: { yahoo: "COST", kind: "equity", label: "Nasdaq · COST" },
  MCD: { yahoo: "MCD", kind: "equity", label: "NYSE · MCD" },
  LLY: { yahoo: "LLY", kind: "equity", label: "NYSE · LLY" },
  GME: { yahoo: "GME", kind: "equity", label: "NYSE · GME" },
  AMC: { yahoo: "AMC", kind: "equity", label: "NYSE · AMC" },
  HIMS: { yahoo: "HIMS", kind: "equity", label: "NYSE · HIMS" },
  SOUN: { yahoo: "SOUN", kind: "equity", label: "Nasdaq · SOUN" },
  IREN: { yahoo: "IREN", kind: "equity", label: "Nasdaq · IREN" },
  LITE: { yahoo: "LITE", kind: "equity", label: "Nasdaq · LITE" },
  DJT: { yahoo: "DJT", kind: "equity", label: "Nasdaq · DJT" },
  HOOD: { yahoo: "HOOD", kind: "equity", label: "Nasdaq · HOOD" },
  COIN: { yahoo: "COIN", kind: "equity", label: "Nasdaq · COIN" },
  CRCL: { yahoo: "CRCL", kind: "equity", label: "NYSE · CRCL" },
  MSTR: { yahoo: "MSTR", kind: "equity", label: "Nasdaq · MSTR" },
  TSM: {
    yahoo: "TSM",
    kind: "equity",
    proxy: true,
    label: "NYSE · TSM (ADR)",
    note: "Reference is the US ADR; TSM also trades in Taipei.",
  },
  BABA: {
    yahoo: "BABA",
    kind: "equity",
    proxy: true,
    label: "NYSE · BABA (ADR)",
    note: "Reference is the US ADR; BABA also trades in Hong Kong.",
  },
  ARM: { yahoo: "ARM", kind: "equity", label: "Nasdaq · ARM (ADR)" },
  ASML: {
    yahoo: "ASML",
    kind: "equity",
    proxy: true,
    label: "Nasdaq · ASML (ADR)",
    note: "Reference is the US ADR; ASML also trades in Amsterdam.",
  },
  BMNR: { yahoo: "BMNR", kind: "equity", label: "NYSE American · BMNR" },

  // ── ETFs ─────────────────────────────────────────────────────────────
  SPY: { yahoo: "SPY", kind: "etf", label: "NYSE Arca · SPY" },
  QQQ: { yahoo: "QQQ", kind: "etf", label: "Nasdaq · QQQ" },
  GLD: {
    yahoo: "GLD",
    kind: "etf",
    label: "NYSE Arca · GLD",
    note: "GLD tracks gold bullion per share; the token tracks GLD, not spot gold.",
  },
  SLV: { yahoo: "SLV", kind: "etf", label: "NYSE Arca · SLV" },
  USO: { yahoo: "USO", kind: "etf", label: "NYSE Arca · USO" },
  SOXL: {
    yahoo: "SOXL",
    kind: "etf",
    proxy: true,
    label: "NYSE Arca · SOXL",
    note: "Leveraged ETF — daily reset means the token drifts from the index over time by design.",
  },
  SOXS: { yahoo: "SOXS", kind: "etf", proxy: true, label: "NYSE Arca · SOXS", note: "Leveraged ETF (inverse), daily reset." },
  TQQQ: { yahoo: "TQQQ", kind: "etf", proxy: true, label: "Nasdaq · TQQQ", note: "Leveraged ETF, daily reset." },
  EWY: { yahoo: "EWY", kind: "etf", label: "NYSE Arca · EWY" },
  DRAM: { yahoo: "DRAM", kind: "etf", label: "NYSE Arca · DRAM" },
  KORU: { yahoo: "KORU", kind: "etf", proxy: true, label: "NYSE Arca · KORU", note: "Leveraged ETF, daily reset." },
  SNXX: { yahoo: "SNXX", kind: "etf", proxy: true, label: "Nasdaq · SNXX", note: "Leveraged ETF, daily reset." },

  // ── Commodities ──────────────────────────────────────────────────────
  GOLD: {
    yahoo: "GC=F",
    kind: "futures",
    proxy: true,
    label: "COMEX · gold front-month",
    note: "COMEX front-month futures carry a basis over spot gold. Tokens tracking LBMA spot can show a persistent few-tenths difference. Per-gram tokens are normalised to troy ounces (×31.1035).",
  },
  SILVER: {
    yahoo: "SI=F",
    kind: "futures",
    proxy: true,
    label: "COMEX · silver front-month",
    note: "COMEX front-month basis applies, same as gold.",
  },
};

/**
 * Per-token overrides — when one asset has tokens tracking a different share
 * class or instrument than the headline asset.
 */
export const TOKEN_REFERENCE_OVERRIDES: Record<string, string> = {
  // CMC groups Alphabet Class C tokens under the GOOGL (Class A) asset.
  GOOGon: "GOOG",
};

/** Per-token caveats that should travel with the number. */
export const TOKEN_NOTES: Record<string, string> = {
  NVDAX: "Tracker certificate issued by Backed (Swiss DLT Act).",
  NVDAon: "Total-return note — dividends are reinvested into the token, so it drifts above the ticker over time.",
  NVDAB: "bStocks certificate (ADGM).",
  rNVDA: "Reality token (rToken), 1:1 backed.",
  GOOGon: "Class C token grouped by CMC under the GOOGL asset — priced against GOOG, not GOOGL.",
};

export function referenceFor(
  assetSymbol: string,
  tokenSymbol?: string,
): ReferenceSpec | null {
  if (tokenSymbol && TOKEN_REFERENCE_OVERRIDES[tokenSymbol]) {
    const override = REFERENCE_MAP[TOKEN_REFERENCE_OVERRIDES[tokenSymbol]] ?? {
      yahoo: TOKEN_REFERENCE_OVERRIDES[tokenSymbol],
      kind: "equity" as ReferenceKind,
      label: `Nasdaq · ${TOKEN_REFERENCE_OVERRIDES[tokenSymbol]}`,
    };
    return override;
  }
  return REFERENCE_MAP[assetSymbol] ?? null;
}

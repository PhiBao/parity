import type { ReferenceSpec } from "./mapping";

export type MarketSession = "open" | "extended" | "closed";

export interface ReferenceQuote {
  /** Provider symbol the quote came from. */
  symbol: string;
  /**
   * Most recent comprehensive print:
   *  - live regular-session price while the market is open
   *  - extended-hours price during pre/post sessions and overnight
   *  - last regular close when nothing newer exists
   */
  price: number;
  regularClose: number | null;
  extendedPrice: number | null;
  previousClose: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  currency: string;
  exchange: string;
  /** Unix ms of the most recent print that backs `price`. */
  asOf: number;
  session: MarketSession;
  /** True when no fresh underlying print exists (weekend/holiday). */
  stale: boolean;
  source: "yahoo" | "cnbc";
  /** Human label for the print behind `price`, e.g. "post-market print". */
  priceLabel: string;
}

export interface ReferenceHistory {
  symbol: string;
  /** ISO date (UTC) → split-adjusted regular-session close. */
  closes: Record<string, number>;
}

export interface ReferenceProvider {
  name: "yahoo" | "cnbc";
  fetchQuote(spec: ReferenceSpec): Promise<ReferenceQuote | null>;
}

/**
 * Small request gate shared by every reference provider.
 *
 * Free quote endpoints throttle aggressively under bursts (Yahoo answers 429
 * after a few dozen parallel calls), so the app funnels every outbound quote
 * request through one queue: max 2 in flight, ~250ms apart. Combined with the
 * caches this keeps a cold board load well inside provider limits.
 */
class Gate {
  private active = 0;
  private lastStart = 0;

  constructor(
    private readonly maxConcurrent = 4,
    private readonly minGapMs = 140,
  ) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    while (this.active >= this.maxConcurrent) {
      await new Promise((r) => setTimeout(r, 40));
    }
    this.active += 1;
    const wait = Math.max(0, this.lastStart + this.minGapMs - Date.now());
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastStart = Date.now();
    try {
      return await task();
    } finally {
      this.active -= 1;
    }
  }
}

export const referenceGate = new Gate();

export function classifySession(
  periods:
    | {
        pre?: { start: number; end: number };
        regular?: { start: number; end: number };
        post?: { start: number; end: number };
      }
    | undefined,
  now = Date.now(),
): MarketSession {
  if (!periods) return "closed";
  const t = Math.floor(now / 1000);
  const { pre, regular, post } = periods;
  if (regular && t >= regular.start && t < regular.end) return "open";
  if ((pre && t >= pre.start && t < pre.end) || (post && t >= post.start && t < post.end)) {
    return "extended";
  }
  return "closed";
}

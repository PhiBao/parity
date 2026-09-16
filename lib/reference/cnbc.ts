import type { ReferenceProvider, ReferenceQuote } from "./provider";
import { referenceGate } from "./provider";
import type { ReferenceSpec } from "./mapping";

/**
 * Fallback reference provider.
 *
 * CNBC's public quote endpoint needs no key and returns a timestamped
 * regular price plus an explicit extended-hours block. It is used only when
 * the primary provider is rate-limited or unreachable, so the app degrades to
 * a second live source instead of falling back to a stale cache.
 */

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

interface CnbcQuote {
  symbol?: string;
  last?: string;
  last_time?: string;
  previous_day_closing?: string;
  currencyCode?: string;
  exchange?: string;
  ExtendedMktQuote?: {
    type?: string;
    last?: string;
    last_time?: string;
    last_timedate?: string;
  };
}

function num(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export const cnbcProvider: ReferenceProvider = {
  name: "cnbc",
  async fetchQuote(spec: ReferenceSpec): Promise<ReferenceQuote | null> {
    // CNBC covers equities and ETFs; futures symbols like GC=F have no quote here.
    if (spec.kind === "futures") return null;

    const url = `https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=${encodeURIComponent(
      spec.yahoo,
    )}&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json&events=1`;

    const res = await referenceGate.run(() =>
      fetch(url, {
        headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
        signal: AbortSignal.timeout(9_000),
        cache: "no-store",
      }),
    );
    if (!res.ok) throw new Error(`cnbc responded ${res.status}`);

    const json = (await res.json()) as {
      FormattedQuoteResult?: { FormattedQuote?: CnbcQuote[] };
    };
    const quote = json.FormattedQuoteResult?.FormattedQuote?.[0];
    const regularClose = num(quote?.last);
    if (!quote || regularClose == null) return null;

    const extended = quote.ExtendedMktQuote;
    const extendedPrice = num(extended?.last);
    const extendedState = extended?.type ?? "";
    const session =
      extendedState.includes("PRE") || extendedState.includes("POST")
        ? "extended"
        : "open";

    // CNBC reports the date only; treat an extended print as "now-ish" and a
    // regular print as the most recent close on that date.
    const asOf = quote.last_time ? Date.parse(`${quote.last_time}T20:00:00Z`) : Date.now();

    const price = session === "extended" && extendedPrice != null ? extendedPrice : regularClose;

    return {
      symbol: quote.symbol ?? spec.yahoo,
      price,
      regularClose,
      extendedPrice: session === "extended" ? extendedPrice : null,
      previousClose: num(quote.previous_day_closing),
      dayHigh: null,
      dayLow: null,
      currency: quote.currencyCode ?? "USD",
      exchange: quote.exchange ?? "",
      asOf: Number.isFinite(asOf) ? asOf : Date.now(),
      session,
      stale: false,
      source: "cnbc",
      priceLabel:
        session === "extended" && extendedPrice != null
          ? `${extended?.last_timedate ?? "extended-hours"} print`
          : "last regular close",
    };
  },
};

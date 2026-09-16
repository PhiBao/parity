import { cmcGetWithEvidence } from "@/lib/cmc/client";
import type { RwaQuotesLatest } from "@/lib/cmc/types";
import { fetchReference } from "@/lib/reference";
import { referenceFor } from "@/lib/reference/mapping";
import { buildVerdict, type VerdictResult } from "@/lib/verdict/engine";

export type TriggerOp = "above" | "below";

export interface WatchItem {
  symbol: string;
  op: TriggerOp;
  /** Threshold on the blended premium, in percent. */
  thresholdPct: number;
  /** Prefer this wrapper when reporting the cheapest route. */
  preferredWrapper?: string | null;
}

export interface WatchEvaluation {
  symbol: string;
  premiumPct: number | null;
  verdict: VerdictResult["verdict"];
  confidence: VerdictResult["confidence"];
  bestWrapper: string | null;
  spreadBps: number | null;
  referenceSymbol: string | null;
  referenceAgeHours: number | null;
  triggered: boolean;
  reason: string;
  evaluatedAt: string;
}

/**
 * Server-side, live evaluation of a watchlist. The watchlist itself lives in
 * the browser (no accounts, no database), but every number here comes from a
 * fresh CMC call at evaluation time — nothing is cached from the client.
 */
export async function evaluateWatchlist(items: WatchItem[]): Promise<WatchEvaluation[]> {
  const unique = Array.from(new Map(items.map((i) => [i.symbol.toUpperCase(), i])).values());
  if (unique.length === 0) return [];

  const { data } = await cmcGetWithEvidence<RwaQuotesLatest>("/v5/real-world-assets/quotes/latest", {
    symbol: unique.map((i) => i.symbol.toUpperCase()).join(","),
    convert: "USD",
    skip_invalid: "true",
  });

  const assets = data.rwa_assets ?? [];

  return Promise.all(
    unique.map(async (item) => {
      const asset = assets.find((a) => a.symbol.toUpperCase() === item.symbol.toUpperCase());
      const evaluatedAt = new Date().toISOString();
      if (!asset) {
        return {
          symbol: item.symbol.toUpperCase(),
          premiumPct: null,
          verdict: "NO_DATA" as const,
          confidence: "low" as const,
          bestWrapper: null,
          spreadBps: null,
          referenceSymbol: null,
          referenceAgeHours: null,
          triggered: false,
          reason: "CoinMarketCap did not return this asset.",
          evaluatedAt,
        };
      }

      const spec = referenceFor(asset.symbol);
      const reference = spec ? await fetchReference(spec) : null;
      const verdict = buildVerdict(asset, reference);
      const premium = verdict.premiumPct;

      const triggered =
        premium != null &&
        verdict.verdict !== "ILLIQUID" &&
        (item.op === "above" ? premium >= item.thresholdPct : premium <= item.thresholdPct);

      const reason = triggered
        ? `Premium ${premium >= 0 ? "+" : ""}${premium.toFixed(2)}% is ${item.op} your ${item.thresholdPct}% threshold.`
        : premium == null
          ? "No reference available for this asset."
          : `Premium ${premium >= 0 ? "+" : ""}${premium.toFixed(2)}% is not ${item.op} ${item.thresholdPct}% yet.`;

      return {
        symbol: asset.symbol,
        premiumPct: premium,
        verdict: verdict.verdict,
        confidence: verdict.confidence,
        bestWrapper: verdict.best?.symbol ?? null,
        spreadBps: verdict.spreadBps,
        referenceSymbol: verdict.reference?.symbol ?? null,
        referenceAgeHours: verdict.reference?.ageHours ?? null,
        triggered,
        reason,
        evaluatedAt,
      };
    }),
  );
}

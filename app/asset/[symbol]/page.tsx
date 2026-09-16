import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { VerdictCard } from "@/components/VerdictCard";
import { WrapperTable } from "@/components/WrapperTable";
import { SignalChart, type ChartSeries } from "@/components/SignalChart";
import { EvidenceDrawer } from "@/components/EvidenceDrawer";
import { WatchPanel } from "@/components/WatchPanel";
import { ShareCard } from "@/components/ShareCard";
import { Panel, SectionHeading, Pill, KeyValue } from "@/components/ui";
import { getAsset, getAssetRaw } from "@/lib/services/assets";
import { buildHistory } from "@/lib/verdict/history";
import { fmtCompactUsd, fmtDate, fmtPct, fmtTimeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbol: string }>;
}): Promise<Metadata> {
  const { symbol } = await params;
  return {
    title: `${symbol.toUpperCase()} fair value & wrapper spread`,
    description: `Live premium of every tokenised ${symbol.toUpperCase()} wrapper against the underlying instrument, from CoinMarketCap RWA data.`,
  };
}

export default async function AssetPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;

  let payload: Awaited<ReturnType<typeof getAsset>> = null;
  let upstreamError = false;
  let notFound = false;
  try {
    payload = await getAsset(symbol, { fresh: true });
  } catch (error) {
    // CMC answers an unknown ticker with a validation error (4001), not an
    // empty result — that is a "no such asset", not an outage.
    const validation = error instanceof Error && /invalid parameter/i.test(error.message);
    if (validation) notFound = true;
    else upstreamError = true;
  }

  if (!payload) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-xl font-medium">
          {notFound
            ? `No tokenised asset found for “${symbol}”`
            : upstreamError
              ? "Market data is unavailable right now"
              : `No tokenised asset found for “${symbol}”`}
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          {notFound
            ? "CoinMarketCap's RWA map returned no match. Try a ticker like NVDA, SPY or GOLD."
            : upstreamError
              ? "CoinMarketCap did not answer this request. The board still works — try again in a moment."
              : "CoinMarketCap returned no priced tokens for this asset."}
        </p>
        <div className="mt-4 flex items-center justify-center gap-4 text-sm">
          <Link href="/" className="text-accent">
            ← back to the board
          </Link>
          {upstreamError ? (
            <Link href={`/asset/${encodeURIComponent(symbol)}`} className="text-muted hover:text-fg">
              retry
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  const { verdict, info, issuers } = payload;
  const asset = await getAssetRaw(verdict.symbol);
  const history = asset ? await buildHistory(asset) : null;

  // The chart shows recent sessions so day-to-day structure stays readable;
  // the all-time peak is called out in the stats instead of flattening the axis.
  const WINDOW_DAYS = 180;
  const cutoff = (() => {
    if (!history?.stats.windowEnd) return null;
    const end = Date.parse(`${history.stats.windowEnd}T00:00:00Z`);
    return new Date(end - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  })();
  const inWindow = (date: string) => !cutoff || date >= cutoff;

  const primarySpread = history?.spreads.reduce(
    (best, s) => (s.points.length > best.points.length ? s : best),
    history.spreads[0],
  );
  const primaryPremium = history?.premiums.reduce(
    (best, p) => (p.points.length > best.points.length ? p : best),
    history?.premiums[0] ?? undefined,
  );

  const chartSeries: ChartSeries[] = [];
  if (primarySpread) {
    chartSeries.push({
      label: `${primarySpread.base} over ${primarySpread.quote} (bps)`,
      color: "#d8ff3e",
      points: primarySpread.points
        .filter((p) => inWindow(p.date))
        .map((p) => ({ date: p.date, value: p.bps })),
    });
  }
  if (primaryPremium) {
    chartSeries.push({
      label: `${primaryPremium.symbol} vs underlying (bps)`,
      color: "#8b8f96",
      dash: true,
      // Both series are plotted in bps so one axis means one thing.
      points: primaryPremium.points
        .filter((p) => inWindow(p.date))
        .map((p) => ({ date: p.date, value: p.value * 100 })),
    });
  }

  const sparkline =
    primaryPremium?.points.slice(-60).map((p) => p.value) ??
    primarySpread?.points.slice(-60).map((p) => p.bps / 100) ??
    [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-xs text-dim transition hover:text-fg">
            <ArrowLeft className="h-3.5 w-3.5" /> board
          </Link>
          <span className="text-line-strong">/</span>
          <h1 className="text-lg font-medium tracking-tight">
            <span className="font-mono">{verdict.symbol}</span>{" "}
            <span className="text-muted">{verdict.name}</span>
          </h1>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-dim">
          <span>priced {fmtTimeAgo(payload.generatedAt)}</span>
          {info?.tradfiMarkets?.length ? (
            <a
              href={info.tradfiMarkets[0].url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-accent transition hover:opacity-80"
            >
              <ExternalLink className="h-3 w-3" />
              underlying venue
            </a>
          ) : null}
        </div>
      </div>

      <VerdictCard verdict={verdict} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Panel className="px-4 py-4 sm:px-5">
            <SectionHeading
              eyebrow={`${verdict.wrappers.filter((w) => !w.derivative).length} tokenised wrappers`}
              title="Every wrapper, ranked"
              hint="Included rows feed the verdict. Excluded rows stay visible with the exact reason — stale venues, unit mismatches and derivatives are never silently dropped."
            />
            <WrapperTable wrappers={verdict.wrappers} />
          </Panel>

          <Panel className="px-4 py-4 sm:px-5">
            <SectionHeading
              eyebrow={
                history
                  ? `last ${WINDOW_DAYS} sessions · ${history.wrappers.length} wrappers · window ${cutoff ?? history.stats.windowStart} → ${history.stats.windowEnd}`
                  : undefined
              }
              title="Dislocation history"
              hint="Cross-wrapper spread is drift-free: both legs are tokenised claims on the same instrument, so dividends and reference quirks cancel out. Shaded bands are weekends and market holidays."
            />
            {chartSeries.length > 0 && history ? (
              <>
                <div className="space-y-6">
                  {chartSeries[0] ? (
                    <div>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
                          cross-wrapper spread · drift-free
                        </span>
                        <span className="text-[11px] text-dim">
                          both legs are tokenised claims, so dividends and share-class quirks cancel
                        </span>
                      </div>
                      <SignalChart
                        series={[chartSeries[0]]}
                        weekendDates={history.weekendDates}
                      />
                    </div>
                  ) : null}
                  {chartSeries[1] ? (
                    <div>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                          wrapper vs underlying · includes closed-market drift
                        </span>
                        <span className="text-[11px] text-dim">
                          overnight and weekend moves in the token are real prices, not wrapper premium
                        </span>
                      </div>
                      <SignalChart
                        series={[chartSeries[1]]}
                        weekendDates={history.weekendDates}
                      />
                    </div>
                  ) : null}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-4">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
                      peak spread
                    </div>
                    <div className="mt-1 font-mono text-sm tabular text-dispersion">
                      {history.stats.maxAbsSpreadBps != null
                        ? `${Math.abs(Math.round(history.stats.maxAbsSpreadBps))} bps`
                        : "—"}
                    </div>
                    <div className="text-[10px] text-dim">all-time, either direction</div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
                      worst premium
                    </div>
                    <div className="mt-1 font-mono text-sm tabular text-over">
                      {history.stats.worstPremium
                        ? fmtPct(history.stats.worstPremium.premiumPct)
                        : "—"}
                    </div>
                    <div className="text-[10px] text-dim">
                      {history.stats.worstPremium?.symbol} · {history.stats.worstPremium?.date}
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
                      weekends
                    </div>
                    <div className="mt-1 font-mono text-sm tabular text-muted">
                      {history.stats.weekendMeanAbsPremiumPct != null
                        ? `${history.stats.weekendMeanAbsPremiumPct.toFixed(2)}%`
                        : "—"}
                    </div>
                    <div className="text-[10px] text-dim">avg absolute premium</div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
                      weekdays
                    </div>
                    <div className="mt-1 font-mono text-sm tabular text-muted">
                      {history.stats.weekdayMeanAbsPremiumPct != null
                        ? `${history.stats.weekdayMeanAbsPremiumPct.toFixed(2)}%`
                        : "—"}
                    </div>
                    <div className="text-[10px] text-dim">avg absolute premium</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Pill>{history.stats.episodeCount} episodes &gt; 100 bps</Pill>
                  <Pill>CMC OHLCV × public reference closes</Pill>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted">
                Not enough wrapper history for this asset yet — CoinMarketCap&apos;s OHLCV coverage
                for this token starts recently.
              </p>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <WatchPanel symbol={verdict.symbol} />

          <ShareCard
            symbol={verdict.symbol}
            name={verdict.name}
            verdict={verdict.verdict}
            premiumPct={verdict.premiumPct}
            spreadBps={verdict.spreadBps}
            referenceSymbol={verdict.reference?.symbol ?? null}
            referencePrice={verdict.reference?.price ?? null}
            cheapest={verdict.best?.symbol ?? null}
            dearest={verdict.worst?.symbol ?? null}
            sparkline={sparkline}
          />

          <Panel className="px-5 py-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-dim">
              asset context
            </div>
            <div className="mt-2 divide-y divide-line/60">
              <KeyValue label="type">{verdict.assetType}</KeyValue>
              <KeyValue label="rwa_id">
                <span className="font-mono text-xs">{verdict.rwaId}</span>
              </KeyValue>
              {info?.industry ? <KeyValue label="industry">{info.industry}</KeyValue> : null}
              {info?.founded ? <KeyValue label="founded">{fmtDate(info.founded)}</KeyValue> : null}
              {info?.employees ? (
                <KeyValue label="employees">{info.employees.toLocaleString()}</KeyValue>
              ) : null}
              {info?.cik ? (
                <KeyValue label="SEC CIK">
                  <span className="font-mono text-xs">{info.cik}</span>
                </KeyValue>
              ) : null}
              <KeyValue label="tokenised mkt cap">
                <span className="font-mono text-xs">
                  {fmtCompactUsd(verdict.aggregate.tokenizedMarketCap)}
                </span>
              </KeyValue>
            </div>
            {info?.description ? (
              <p className="mt-3 max-h-40 overflow-y-auto border-t border-line pt-3 text-[11px] leading-relaxed text-dim">
                {info.description.replace(/###/g, "").slice(0, 600)}
                {info.description.length > 600 ? "…" : ""}
              </p>
            ) : null}
          </Panel>

          {issuers.length > 0 ? (
            <Panel className="px-5 py-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-dim">
                issuers behind these wrappers
              </div>
              <ul className="mt-2 space-y-2">
                {issuers.map((issuer) => (
                  <li key={issuer.id} className="flex items-center justify-between gap-3">
                    <span className="text-xs text-fg">{issuer.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-dim">
                        {issuer.numTokens} tokens
                      </span>
                      {issuer.website ? (
                        <a
                          href={issuer.website}
                          target="_blank"
                          rel="noreferrer"
                          className="text-dim transition hover:text-accent"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      </div>

      <EvidenceDrawer
        evidence={payload.evidence}
        description="The exact CoinMarketCap calls behind every number above — request URL, HTTP status, credits consumed and the raw response envelope. The API key is never sent to the browser."
      />
    </div>
  );
}

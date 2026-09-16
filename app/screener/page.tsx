import Link from "next/link";
import { Panel, SectionHeading, Pill } from "@/components/ui";
import { getScreenerCached } from "@/lib/services/assets";
import { fmtBps, fmtCompactUsd, fmtPct, fmtTimeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Dislocation screener",
  description:
    "Every tokenised asset in the CoinMarketCap RWA universe ranked by the spread between its cheapest and dearest wrapper.",
};

const TYPE_LABEL: Record<string, string> = {
  stock: "stocks",
  etf: "ETFs",
  commodity: "commodities",
  currency: "currencies",
  government_security: "gov. securities",
  real_estate: "real estate",
};

export default async function ScreenerPage() {
  const screener = await getScreenerCached();

  const byType = new Map<string, number>();
  for (const row of screener.rows) {
    byType.set(row.assetType, (byType.get(row.assetType) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow={`${screener.scanned} assets scanned · ${fmtTimeAgo(screener.asOf)} · ${screener.creditsUsed.credits} credits this session`}
        title="Wrapper dislocation screener"
        hint="Ranked by the gap between the cheapest and dearest wrapper for identical exposure. This screen needs no external reference price — both legs are tokenised claims — so it covers the entire RWA universe in two API calls."
      />

      <div className="flex flex-wrap gap-2">
        {[...byType.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([type, count]) => (
            <Pill key={type}>
              {TYPE_LABEL[type] ?? type} · {count}
            </Pill>
          ))}
      </div>

      <Panel className="px-4 py-3 sm:px-5">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
                <th className="py-2 pr-3 font-normal">#</th>
                <th className="py-2 pr-3 font-normal">asset</th>
                <th className="py-2 pr-3 font-normal">type</th>
                <th className="py-2 pr-3 text-right font-normal">wrapper gap</th>
                <th className="py-2 pr-3 font-normal" title="Cheaper leg after dividend-accrual adjustment where applied. When legs disagree, open the asset before acting.">cheaper leg</th>
                <th className="py-2 pr-3 font-normal" title="Dearer leg after dividend-accrual adjustment where applied.">dearer leg</th>
                <th className="py-2 pr-3 font-normal">call</th>
                <th className="py-2 pr-3 text-right font-normal">wrappers</th>
                <th className="py-2 pr-3 text-right font-normal">24h volume</th>
              </tr>
            </thead>
            <tbody>
              {screener.rows.map((row, index) => (
                <tr
                  key={row.symbol}
                  className="border-b border-line/60 transition hover:bg-white/[0.02]"
                >
                  <td className="py-2.5 pr-3 font-mono text-[10px] text-dim">{index + 1}</td>
                  <td className="py-2.5 pr-3">
                    <Link href={`/asset/${row.symbol}`} className="group flex items-center gap-2">
                      <span className="font-mono text-xs text-fg group-hover:text-accent">
                        {row.symbol}
                      </span>
                      <span className="hidden max-w-[200px] truncate text-xs text-dim md:inline">
                        {row.name}
                      </span>
                    </Link>
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-[10px] uppercase tracking-wider text-dim">
                    {row.assetType}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono tabular text-xs text-dispersion">
                    {fmtBps(row.spreadBps)}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className="font-mono text-xs text-under">{row.bestSymbol}</span>
                    <span className="ml-2 hidden text-[10px] text-dim lg:inline">
                      {row.bestIssuer}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className="font-mono text-xs text-over">{row.worstSymbol}</span>
                    <span className="ml-2 hidden text-[10px] text-dim lg:inline">
                      {row.worstIssuer}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className="flex items-center gap-1.5">
                      {row.legsDisagree ? (
                        <Pill tone="warn" title="The live legs disagree beyond the dispersion threshold — open the asset before acting on either side.">
                          legs disagree
                        </Pill>
                      ) : row.verdict === "FAIR" ? (
                        <Pill tone="ok">tracking</Pill>
                      ) : row.verdict === "RELATIVE" ? (
                        <Pill>relative</Pill>
                      ) : (
                        <Pill tone="warn">{row.verdict.toLowerCase()}</Pill>
                      )}
                      {row.accrualApplied ? (
                        <Pill tone="accent" title="Ondo-style dividend accrual was stripped from total-return legs before ranking this row.">
                          adj
                        </Pill>
                      ) : row.hasTotalReturn && !row.accrualResolved ? (
                        <Pill title="A total-return wrapper is present but its accrual could not be resolved — treat this row as indicative.">
                          raw
                        </Pill>
                      ) : null}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono tabular text-xs text-muted">
                    {row.wrapperCount}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono tabular text-xs text-muted">
                    {fmtCompactUsd(row.volume24h)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <p className="text-xs text-dim">
        Assets below $100K of combined 24h tokenised volume are excluded — a spread you cannot
        trade on is not a signal. Premium versus the underlying reference is on each asset page.
        {screener.rows[0]?.dispersionPct != null ? (
          <>
            {" "}
            Current widest dispersion: {fmtPct(screener.rows[0].dispersionPct)} stdev around the
            median price (normalised, annualised dispersion is not meaningful here).
          </>
        ) : null}
      </p>
    </div>
  );
}

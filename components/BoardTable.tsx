import Link from "next/link";
import { VerdictBadge, Pill } from "@/components/ui";
import { fmtBps, fmtCompactUsd, fmtPct } from "@/lib/format";
import type { VerdictResult } from "@/lib/verdict/engine";

function premiumTone(value: number | null): string {
  if (value == null) return "text-dim";
  if (value > 0.75) return "text-over";
  if (value < -0.75) return "text-under";
  return "text-muted";
}

export function BoardTable({ assets, dense = false }: { assets: VerdictResult[]; dense?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
            <th className="py-2 pr-3 font-normal">asset</th>
            <th className="py-2 pr-3 font-normal">call</th>
            <th className="py-2 pr-3 text-right font-normal">premium</th>
            <th className="py-2 pr-3 text-right font-normal">wrapper gap</th>
            <th className="py-2 pr-3 font-normal">cheapest route</th>
            <th className="py-2 pr-3 text-right font-normal">24h volume</th>
            {!dense ? <th className="py-2 pr-3 text-right font-normal">confidence</th> : null}
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => (
            <tr key={asset.symbol} className="border-b border-line/60 transition hover:bg-white/[0.02]">
              <td className="py-2.5 pr-3">
                <Link href={`/asset/${asset.symbol}`} className="group flex items-center gap-2">
                  <span className="font-mono text-xs text-fg group-hover:text-accent">
                    {asset.symbol}
                  </span>
                  <span className="hidden max-w-[220px] truncate text-xs text-dim sm:inline">
                    {asset.name}
                  </span>
                </Link>
              </td>
              <td className="py-2.5 pr-3">
                <VerdictBadge verdict={asset.verdict} size="sm" />
              </td>
              <td className={`py-2.5 pr-3 text-right font-mono tabular text-xs ${premiumTone(asset.premiumPct)}`}>
                {asset.premiumPct == null ? "—" : fmtPct(asset.premiumPct)}
              </td>
              <td className="py-2.5 pr-3 text-right font-mono tabular text-xs text-muted">
                {asset.spreadBps == null ? "—" : `${asset.spreadBps} bps`}
              </td>
              <td className="py-2.5 pr-3">
                {asset.best ? (
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-xs text-fg">{asset.best.symbol}</span>
                    {asset.best.issuerName ? (
                      <span className="hidden text-[10px] text-dim md:inline">
                        {asset.best.issuerName}
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className="text-xs text-dim">—</span>
                )}
              </td>
              <td className="py-2.5 pr-3 text-right font-mono tabular text-xs text-muted">
                {fmtCompactUsd(asset.totalVolume24h)}
              </td>
              {!dense ? (
                <td className="py-2.5 pr-3 text-right">
                  {asset.confidence === "low" ? (
                    <Pill tone="warn">low</Pill>
                  ) : asset.confidence === "medium" ? (
                    <Pill>medium</Pill>
                  ) : (
                    <Pill tone="ok">high</Pill>
                  )}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface DislocationRow {
  symbol: string;
  name: string;
  spreadBps: number | null;
  bestSymbol: string | null;
  worstSymbol: string | null;
}

export function DislocationStrip({ rows }: { rows: DislocationRow[] }) {
  const withSpread = rows.filter((r) => r.spreadBps != null && r.spreadBps > 0).slice(0, 5);
  const max = Math.max(...withSpread.map((r) => r.spreadBps ?? 0), 1);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {withSpread.map((row) => (
        <Link
          key={row.symbol}
          href={`/asset/${row.symbol}`}
          className="group rounded-xl border border-line bg-elevated/70 p-4 transition hover:border-line-strong hover:bg-elevated"
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-fg group-hover:text-accent">{row.symbol}</span>
            <span className="font-mono text-xs tabular text-dispersion">
              {fmtBps(row.spreadBps)}
            </span>
          </div>
          <div className="mt-2 text-[11px] leading-snug text-dim">
            {row.bestSymbol} vs {row.worstSymbol}
          </div>
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-dispersion/70"
              style={{ width: `${Math.max(6, ((row.spreadBps ?? 0) / max) * 100)}%` }}
            />
          </div>
        </Link>
      ))}
    </div>
  );
}

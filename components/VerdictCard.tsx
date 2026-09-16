import { VerdictBadge, Pill, Stat } from "@/components/ui";
import { fmtBps, fmtCompactUsd, fmtPct, fmtPrice, fmtTimeAgo } from "@/lib/format";
import type { VerdictResult } from "@/lib/verdict/engine";

function bigNumber(v: VerdictResult): { value: string; label: string; tone: string } {
  const tone =
    v.verdict === "OVERPRICED"
      ? "text-over"
      : v.verdict === "DISCOUNT"
        ? "text-under"
        : v.verdict === "DISPERSION"
          ? "text-dispersion"
          : v.verdict === "RELATIVE"
            ? "text-relative"
            : v.verdict === "FAIR"
              ? "text-fg"
              : "text-dim";

  if (v.premiumPct != null) {
    return { value: fmtPct(v.premiumPct), label: "blended premium vs TradFi reference", tone };
  }
  if (v.spreadBps != null) {
    return {
      value: fmtBps(v.spreadBps),
      label: "spread between cheapest and dearest wrapper",
      tone: "text-relative",
    };
  }
  return { value: "—", label: "no reference or spread available", tone: "text-dim" };
}

export function VerdictCard({ verdict }: { verdict: VerdictResult }) {
  const big = bigNumber(verdict);
  const ref = verdict.reference;
  const best = verdict.best;
  const worst = verdict.worst;

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-elevated/80">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div className="flex items-center gap-3">
          <VerdictBadge verdict={verdict.verdict} confidence={verdict.confidence} />
          {ref?.session === "open" ? (
            <Pill tone="accent" title="Underlying market is open — reference is live.">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-accent" /> market open
            </Pill>
          ) : ref?.session === "extended" ? (
            <Pill tone="warn" title="Underlying market is in pre/post-market. Reference includes extended hours.">
              extended hours
            </Pill>
          ) : (
            <Pill title="Underlying market is closed. Reference is the last available print.">
              market closed
            </Pill>
          )}
          {ref?.stale ? <Pill tone="warn">reference stale</Pill> : null}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-dim">
          rwa_id {verdict.rwaId} · rank #{verdict.rwaRank} · {verdict.assetType}
        </div>
      </div>

      <div className="grid gap-6 px-5 py-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div>
          <div className={`font-mono text-[54px] leading-none tracking-tighter tabular ${big.tone}`}>
            {big.value}
          </div>
          <div className="mt-2 text-sm text-muted">{big.label}</div>

          <p className="mt-5 text-[15px] font-medium leading-snug text-fg">{verdict.copy.headline}</p>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">{verdict.copy.detail}</p>

          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat
              label="blended price"
              value={fmtPrice(verdict.price)}
              hint={`median of ${verdict.liveCount} live route${verdict.liveCount === 1 ? "" : "s"}`}
            />
            <Stat
              label="cheapest route"
              value={best ? best.symbol : "—"}
              hint={best ? `${fmtPrice(best.price)} · ${fmtCompactUsd(best.volume24h)} / 24h` : undefined}
              tone="positive"
              mono={false}
            />
            <Stat
              label="dearest route"
              value={worst ? worst.symbol : "—"}
              hint={
                worst && verdict.spreadBps != null && verdict.spreadBps > 0
                  ? `+${verdict.spreadBps} bps vs cheapest`
                  : undefined
              }
              mono={false}
            />
            <Stat
              label="24h token volume"
              value={fmtCompactUsd(verdict.totalVolume24h)}
              hint="all wrappers combined"
            />
          </div>
        </div>

        <div className="rounded-lg border border-line bg-inset/60 px-4 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-dim">
            reference instrument
          </div>
          {ref ? (
            <>
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <span className="font-mono text-sm text-fg">{ref.symbol}</span>
                <span className="font-mono text-xl tabular text-fg">{fmtPrice(ref.price)}</span>
              </div>
              <div className="mt-1 text-xs text-dim">
                {ref.exchange} · {ref.session === "open" ? "regular session" : ref.priceLabel ?? ""} ·{" "}
                {fmtTimeAgo(ref.asOf)}
              </div>
              <div className="mt-4 space-y-1.5 border-t border-line pt-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-dim">regular close</span>
                  <span className="font-mono tabular text-muted">{fmtPrice(ref.regularClose)}</span>
                </div>
                {ref.extendedPrice != null ? (
                  <div className="flex justify-between">
                    <span className="text-dim">extended / latest print</span>
                    <span className="font-mono tabular text-muted">{fmtPrice(ref.extendedPrice)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <span className="text-dim">CMC aggregate quote</span>
                  <span className="font-mono tabular text-muted">
                    {fmtPrice(verdict.aggregate.averageTokenizedPrice)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dim">CMC quotes updated</span>
                  <span className="font-mono tabular text-muted">
                    {fmtTimeAgo(verdict.aggregate.lastUpdated)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dim">reference age</span>
                  <span className="font-mono tabular text-muted">
                    {ref.ageHours.toFixed(1)}h
                  </span>
                </div>
              </div>
              {ref.note ? (
                <p className="mt-3 border-t border-line pt-3 text-[11px] leading-relaxed text-dim">
                  {ref.note}
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">
              No TradFi reference is mapped for this asset, so Parity prices it against its own
              wrappers only. Cross-wrapper spreads below are still live.
            </p>
          )}
        </div>
      </div>

      {verdict.drivers.length > 0 ? (
        <div className="border-t border-line px-5 py-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-dim">
            how this call was reached
          </div>
          <ul className="mt-2 space-y-1 text-xs text-muted">
            {verdict.drivers.slice(0, 6).map((d, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-dim">·</span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

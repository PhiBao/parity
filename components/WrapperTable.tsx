import { Pill } from "@/components/ui";
import { fmtCompactUsd, fmtPct, fmtPrice } from "@/lib/format";
import type { Wrapper } from "@/lib/verdict/engine";

function issuerModel(name: string | null): { label: string; title: string } {
  const n = (name ?? "").toLowerCase();
  if (n.includes("derivative")) return { label: "derivatives feed", title: "Perpetual/derivative feed reported by CMC — not a spot wrapper." };
  if (n.includes("backed")) return { label: "tracker certificate", title: "Backed Assets issue 1:1 backed tracker certificates under the Swiss DLT Act." };
  if (n.includes("ondo")) return { label: "total-return note", title: "Ondo tokens reinvest dividends into the token, so the price drifts above the raw ticker over time." };
  if (n.includes("bstocks")) return { label: "ADGM certificate", title: "bStocks are certificates issued under ADGM (Abu Dhabi) regulation." };
  if (n.includes("reality")) return { label: "rToken", title: "Reality issues 1:1 backed rTokens." };
  if (n.includes("robinhood")) return { label: "Robinhood token", title: "Robinhood's tokenised equity listing." };
  if (n.includes("hyperliquid")) return { label: "Hyperliquid market", title: "Hyperliquid on-chain market. Often very thin." };
  if (n.includes("dinari")) return { label: "Dinari dShare", title: "Dinari's dShares. CMC reports no live price for these." };
  if (n.includes("paxos")) return { label: "allocated gold", title: "PAXG is 1 troy ounce of allocated LBMA gold held by Paxos." };
  if (n.includes("tether")) return { label: "allocated gold", title: "XAUt is 1 troy ounce of allocated gold held by Tether." };
  if (n.includes("matrixdock")) return { label: "allocated gold", title: "XAUM is allocated gold from Matrixdock." };
  if (n.includes("comtech")) return { label: "per-gram gold", title: "CGO quotes per gram of gold; normalised to troy ounces here." };
  if (n.includes("vnx")) return { label: "per-gram gold", title: "VNXAU quotes per gram of gold; normalised to troy ounces here." };
  return { label: "tokenised claim", title: name ?? "Tokenised claim on the underlying asset." };
}

export function WrapperTable({ wrappers }: { wrappers: Wrapper[] }) {
  const rows = [...wrappers].sort((a, b) => {
    if (a.included !== b.included) return a.included ? -1 : 1;
    if (a.price == null) return 1;
    if (b.price == null) return -1;
    return a.price - b.price;
  });

  // Exactly one row gets the "cheapest" badge — ties are broken by volume.
  const bestRow = rows
    .filter((r) => r.included && r.price != null)
    .reduce<Wrapper | null>((best, r) => {
      if (!best || best.price == null) return r;
      if ((r.price as number) < best.price) return r;
      if ((r.price as number) === best.price && (r.volume24h ?? 0) > (best.volume24h ?? 0)) return r;
      return best;
    }, null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
            <th className="py-2 pr-3 font-normal">wrapper</th>
            <th className="py-2 pr-3 font-normal">issuer</th>
            <th className="py-2 pr-3 text-right font-normal">price</th>
            <th className="py-2 pr-3 text-right font-normal">vs cheapest</th>
            <th className="py-2 pr-3 text-right font-normal">vs reference</th>
            <th className="py-2 pr-3 text-right font-normal">24h volume</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((w) => {
            const model = issuerModel(w.issuerName);
            const isBest = bestRow != null && w.cryptoId === bestRow.cryptoId;
            return (
              <tr
                key={`${w.symbol}-${w.cryptoId}`}
                className={`border-b border-line/60 transition ${
                  w.included ? "hover:bg-white/[0.02]" : "opacity-60"
                }`}
              >
                <td className="py-2.5 pr-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-fg">{w.symbol}</span>
                    {isBest ? <Pill tone="ok">cheapest</Pill> : null}
                    {w.wrapped ? (
                      <Pill title="Wrapped version of another issuer's token — an extra smart-contract layer.">
                        wrapped
                      </Pill>
                    ) : null}
                    {!w.included ? (
                      <Pill tone={w.derivative ? "default" : "warn"}>
                        {w.derivative ? "derivative" : "excluded"}
                      </Pill>
                    ) : null}
                  </div>
                  {w.unitNote ? (
                    <div className="mt-0.5 text-[10px] text-dim">{w.unitNote}</div>
                  ) : null}
                  {w.excludedReason && !w.derivative ? (
                    <div className="mt-0.5 max-w-[280px] text-[10px] leading-snug text-dispersion/80">
                      {w.excludedReason}
                    </div>
                  ) : null}
                </td>
                <td className="py-2.5 pr-3">
                  <div className="text-xs text-muted">{w.issuerName ?? "—"}</div>
                  <div className="text-[10px] text-dim" title={model.title}>
                    {model.label}
                  </div>
                </td>
                <td className="py-2.5 pr-3 text-right font-mono tabular text-xs text-fg">
                  {fmtPrice(w.price ?? w.rawPrice)}
                </td>
                <td className="py-2.5 pr-3 text-right font-mono tabular text-xs">
                  {w.spreadBpsVsBest == null ? (
                    <span className="text-dim">—</span>
                  ) : w.spreadBpsVsBest === 0 ? (
                    <span className="text-under">best</span>
                  ) : (
                    <span className="text-muted">+{w.spreadBpsVsBest} bps</span>
                  )}
                </td>
                <td className="py-2.5 pr-3 text-right font-mono tabular text-xs">
                  {w.premiumPct == null ? (
                    <span className="text-dim">—</span>
                  ) : (
                    <span
                      className={
                        Math.abs(w.premiumPct) < 0.75
                          ? "text-muted"
                          : w.premiumPct > 0
                            ? "text-over"
                            : "text-under"
                      }
                    >
                      {fmtPct(w.premiumPct)}
                    </span>
                  )}
                </td>
                <td className="py-2.5 pr-3 text-right font-mono tabular text-xs text-muted">
                  {fmtCompactUsd(w.volume24h)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-dim">
        Excluded rows stay visible with the reason attached — Parity never silently drops a venue
        from the maths.
      </p>
    </div>
  );
}

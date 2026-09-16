import { Panel, SectionHeading, Pill, InlineLink } from "@/components/ui";
import { THRESHOLDS } from "@/lib/verdict/engine";

export const metadata = {
  title: "Methodology",
  description:
    "How Parity turns CoinMarketCap RWA data into a fair-value verdict: eligibility pipeline, formulas, thresholds, session handling and known limitations.",
};

export default function MethodologyPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <SectionHeading
        eyebrow="the maths, in full"
        title="Methodology"
        hint="Every number Parity shows is derived from CoinMarketCap RWA responses by the rules below. Nothing is manual, nothing is cached from a screenshot, and every verdict can be reproduced from the evidence drawer on each asset page."
      />

      <Panel className="px-5 py-5">
        <h2 className="text-sm font-medium text-fg">1 · The question</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          A tokenised share is a claim on one instrument, sold through several issuers and venues.
          Two numbers matter to a buyer:
        </p>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          <li>
            <span className="text-fg">Premium</span> — is the token rich or cheap versus the real
            instrument right now?
          </li>
          <li>
            <span className="text-fg">Spread</span> — how much does the choice of wrapper cost me?
          </li>
        </ul>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Parity answers both, and refuses to answer when the data cannot support it.
        </p>
      </Panel>

      <Panel className="px-5 py-5">
        <h2 className="text-sm font-medium text-fg">2 · Eligibility pipeline</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          CoinMarketCap returns every token for an asset in one call — including entries that should
          never influence a price. Each token passes through four filters, in order:
        </p>
        <ol className="mt-4 space-y-4 text-sm text-muted">
          <li>
            <div className="text-fg">Presence</div>
            <p className="mt-1 leading-relaxed">
              Derivatives entries (issuer <span className="font-mono text-xs">NA (Derivatives)</span>
              ) and tokens without a reported price are excluded from the verdict and labelled in the
              table.
            </p>
          </li>
          <li>
            <div className="text-fg">Unit</div>
            <p className="mt-1 leading-relaxed">
              Each price is divided by the reference price. Ratios inside{" "}
              <span className="font-mono text-xs">
                [{THRESHOLDS.sameUnitBand[0]}, {THRESHOLDS.sameUnitBand[1]}]
              </span>{" "}
              count as the same unit. Precious-metal tokens quoting per gram (a ratio near{" "}
              <span className="font-mono text-xs">{ (1/THRESHOLDS.troyOunceFactor).toFixed(4) }</span>
              ) are normalised to troy ounces ×{THRESHOLDS.troyOunceFactor}. Anything else is
              excluded as not comparable rather than reported as a fake discount.
            </p>
          </li>
          <li>
            <div className="text-fg">Liquidity</div>
            <p className="mt-1 leading-relaxed">
              A wrapper needs at least{" "}
              <span className="font-mono text-xs">
                ${THRESHOLDS.minWrapperVolumeUsd.toLocaleString()}
              </span>{" "}
              of 24h volume to count as a live route. Dead venues holding a stale price (we have seen
              $0-volume markets quoted 85% away from everyone else) are shown but not counted.
            </p>
          </li>
          <li>
            <div className="text-fg">Outliers</div>
            <p className="mt-1 leading-relaxed">
              Within live routes, anything more than{" "}
              <span className="font-mono text-xs">{THRESHOLDS.outlierBandPct}%</span> away from the
              median is excluded and explained. This catches stale quotes that still carry volume.
            </p>
          </li>
        </ol>
      </Panel>

      <Panel className="px-5 py-5">
        <h2 className="text-sm font-medium text-fg">3 · The formulas</h2>
        <div className="mt-3 space-y-3 font-mono text-xs text-muted">
          <div className="rounded-md border border-line bg-inset px-3 py-2">
            blended_price = median(included wrapper prices)
          </div>
          <div className="rounded-md border border-line bg-inset px-3 py-2">
            premium % = (blended_price / reference_price − 1) × 100
          </div>
          <div className="rounded-md border border-line bg-inset px-3 py-2">
            wrapper_spread_bps = (dearest / cheapest − 1) × 10,000
          </div>
          <div className="rounded-md border border-line bg-inset px-3 py-2">
            dispersion % = stdev(included prices) / mean(included prices) × 100
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          The median (not the mean) is deliberate: one bad venue cannot move the headline. Spread is
          measured only between wrappers that pass the liquidity bar, and the cheapest route scales
          with market size — at least 0.5% of total 24h volume — so “cheapest” always points at
          something that can actually absorb a trade.
        </p>
      </Panel>

      <Panel className="px-5 py-5">
        <h2 className="text-sm font-medium text-fg">4 · Verdict rules</h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-line">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line/60">
              {[
                {
                  verdict: "OVERPRICED",
                  rule: `premium > +${THRESHOLDS.fairBandPct}%`,
                  meaning: "Token buyers are paying above the instrument's own price.",
                },
                {
                  verdict: "DISCOUNT",
                  rule: `premium < −${THRESHOLDS.fairBandPct}%`,
                  meaning: "Verify redemption and liquidity before treating it as free money.",
                },
                {
                  verdict: "FAIR",
                  rule: `|premium| ≤ ${THRESHOLDS.fairBandPct}%`,
                  meaning:
                    "Tracking well. If the wrapper gap is wide, venue choice becomes the headline.",
                },
                {
                  verdict: "DISPERSION",
                  rule: `dispersion > ${THRESHOLDS.dispersionPct}%`,
                  meaning: "Wrappers have decoupled from each other — a venue problem, not a price call.",
                },
                {
                  verdict: "ILLIQUID",
                  rule: `< $${THRESHOLDS.minAssetVolumeUsd.toLocaleString()} 24h volume`,
                  meaning: "No verdict rather than a number nobody can trade on.",
                },
                {
                  verdict: "RELATIVE",
                  rule: "no mapped TradFi reference",
                  meaning: "Wrapper ranking still works; premium versus the underlying does not.",
                },
              ].map((row) => (
                <tr key={row.verdict}>
                  <td className="w-[120px] px-3 py-2 align-top">
                    <span className="font-mono text-[11px] text-fg">{row.verdict}</span>
                  </td>
                  <td className="w-[220px] px-3 py-2 align-top font-mono text-[11px] text-dim">
                    {row.rule}
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-muted">{row.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel className="px-5 py-5">
        <h2 className="text-sm font-medium text-fg">5 · Sessions and staleness</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Tokenised equities trade 24/7; the instruments they track do not. Comparing a token at 03:00
          UTC against yesterday&apos;s regular close would misread overnight equity drift as wrapper
          premium, so Parity is explicit about the reference it used:
        </p>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          <li>
            <span className="text-fg">Market open</span> — the live regular-session price. Highest
            confidence.
          </li>
          <li>
            <span className="text-fg">Pre/post market</span> — the latest extended-hours print,
            labelled as such, confidence capped.
          </li>
          <li>
            <span className="text-fg">Closed (overnight, weekends, holidays)</span> — the last regular
            close, with its age shown. The premium here measures what the market is paying <em>over
            the last official print</em>, which is exactly the number a buyer is exposed to.
          </li>
        </ul>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Cross-wrapper spread is not affected by any of this: both legs trade around the clock, so
          spread remains the always-valid signal. That is why the history chart leads with it.
        </p>
      </Panel>

      <Panel className="px-5 py-5">
        <h2 className="text-sm font-medium text-fg">6 · Known limitations</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          <li>
            <span className="text-fg">Total-return wrappers drift by design.</span> Ondo tokens
            reinvest dividends into the token, so they gain a small, growing premium versus the raw
            ticker. Premium-versus-reference therefore blends wrapper price with accrued yield; the
            drift-free comparison is wrapper-against-wrapper, which Parity shows first.{" "}
            <Pill>documented, not hidden</Pill>
          </li>
          <li>
            <span className="text-fg">Proxy references.</span> Futures basis (gold, silver), ADRs and
            leveraged ETFs are proxies for the tokenised instrument. Verdicts against them are marked
            and confidence is capped at medium.
          </li>
          <li>
            <span className="text-fg">Reference source.</span> Underlying prices come from public
            exchange endpoints (Yahoo Finance with a CNBC fallback), not from CoinMarketCap — the RWA
            API does not expose the underlying instrument&apos;s own quote. If both providers fail,
            the verdict degrades to relative mode instead of guessing.
          </li>
          <li>
            <span className="text-fg">Venue depth.</span> CoinMarketCap&apos;s market-pairs endpoint,
            which would add per-exchange depth, returns a plan error on the Startup tier used here
            despite the documentation listing it as available. See the{" "}
            <InlineLink href="/feedback">API feedback</InlineLink>.
          </li>
          <li>
            <span className="text-fg">History window.</span> Premium history starts when
            CoinMarketCap&apos;s OHLCV coverage for each wrapper begins — not at token launch.
          </li>
        </ul>
      </Panel>

      <Panel className="px-5 py-5">
        <h2 className="text-sm font-medium text-fg">7 · What would falsify this</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          The product thesis claims that wrapper dislocations are frequent, persistent enough to act
          on, and invisible without this comparison. That thesis fails if, on liquid assets, the
          cross-wrapper spread is reliably inside a few basis points and identical during closed
          market hours. The screener and the history charts are the falsification tools: they show
          the distribution as it is, including when it is boring.
        </p>
      </Panel>
    </div>
  );
}

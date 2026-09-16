import { Panel, SectionHeading, Pill, InlineLink } from "@/components/ui";

export const metadata = {
  title: "API feedback",
  description:
    "What the CoinMarketCap RWA API made possible, and the seven places it got in the way while building Parity.",
};

interface Finding {
  title: string;
  severity: "blocker" | "footgun" | "request";
  detail: string;
  repro?: string;
}

const FINDINGS: Finding[] = [
  {
    title: "market-pairs is documented for Startup but returns a plan error",
    severity: "blocker",
    detail:
      "The endpoint reference lists /v5/real-world-assets/market-pairs/list as available on Basic, Builder, Startup, Growth, Professional and Enterprise. On the Startup-tier key issued for this hackathon it returns error_code 1006, “Your API Key subscription plan doesn't support this endpoint.” This is the single endpoint that would add per-venue depth (exchange, pair, price, 24h volume) — with it, Parity could show whether the cheapest quote has real depth behind it. Without it, venue depth stops at the issuer level.",
    repro:
      'curl -s -H "X-CMC_PRO_API_KEY: $KEY" "https://pro-api.coinmarketcap.com/v5/real-world-assets/market-pairs/list?symbol=NVDA"',
  },
  {
    title: "OHLCV historical silently returns 10 points when time_start is used without count",
    severity: "footgun",
    detail:
      "GET /v2/cryptocurrency/ohlcv/historical?id=36992&time_start=2025-07-01&interval=1d returns exactly 10 daily candles, not the range implied by time_start. Passing count=5000 returns all 441. The parameter is documented but the interaction is easy to misread: it looks like a range query and behaves like a paginated one. A note in the parameter description, or defaulting count to the range, would save every integrator an afternoon.",
  },
  {
    title: "No historical series for RWA assets yet",
    severity: "request",
    detail:
      "7,937 RWA assets have live quotes but no history endpoint — the academy article describes a historical time-series for tokenized price/market cap/volume as “planned for a later phase.” Premium history is the most valuable thing a tracker can show a user, and every builder is currently forced to reconstruct it by joining token OHLCV (crypto market data) against an off-platform price for the underlying. Shipping /v5/real-world-assets/ohlcv/historical with rwa_id would immediately unlock a whole category of tools.",
  },
  {
    title: "No token-economics metadata, so total-return accrual looks like mispricing",
    severity: "footgun",
    detail:
      "Nothing in the RWA family says which wrappers are price-tracking claims and which are total-return instruments. Ondo's *on tokens reinvest dividends, so they legitimately sit 0.3–3.5% above the ticker depending on yield and age — a naive cross-issuer comparison reports that as an arbitrage opportunity (we measured 263 bps on Ford that was almost entirely three quarters of dividends). Every builder must independently discover the token's economics and reconstruct accrual from dividend events. A token_model field — price_tracking / total_return — plus the token's inception date would make every wrapper comparison on the platform correct by default.",
  },
  {
    title: "No session metadata, so token-close vs equity-close conflates after-hours drift with premium",
    severity: "request",
    detail:
      "RWA daily candles close at 23:59:59 UTC while US equities close at 20:00/21:00 UTC. Comparing the two naively bakes four hours of after-hours equity movement into what looks like wrapper premium. We hit this directly: an apparent −5.9% AAPL “discount” on one day was mostly post-earnings after-hours drift in the token, not a cheap wrapper. A session_close timestamp (or a documented alignment field) on RWA market data would let integrators separate the two cleanly.",
  },
  {
    title: "No unit metadata on commodity tokens",
    severity: "footgun",
    detail:
      "Gold is quoted both per troy ounce (PAXG, XAUt, XAUM, XAUT0) and per gram (CGO, VNXAU) inside the same asset family with no field distinguishing them. A naive consumer comparing prices prints an 87% discount for per-gram tokens. We detect the ratio against the reference and normalise ×31.1035, but a grams_per_token or unit field would remove the guesswork entirely.",
  },
  {
    title: "Stale venues are indistinguishable from live ones",
    severity: "footgun",
    detail:
      "The tokens array includes markets with zero supply and $0.00 of 24h volume still carrying a price — in one case 85% away from the rest of the market. Used naively, that is a spectacular fake arbitrage. A last_verified_volume or liquidity flag (or omitting zero-volume venues from quotes/latest) would prevent an entire class of broken dashboards.",
  },
  {
    title: "Derivatives and wrapped tokens are mixed into the spot token list",
    severity: "request",
    detail:
      "issuer_name “NA (Derivatives)” entries and wrapped tokens (WNVDAX, wSPYx) appear in the same tokens[] array as primary issuance. A token_class field — spot / derivative / wrapped — would let integrators filter intent without string-matching issuer names. Similarly small: issuers/list reports issuer names that need fuzzy matching against token issuer_name to attribute lineage.",
  },
];

const severityTone: Record<Finding["severity"], "danger" | "warn" | "default"> = {
  blocker: "danger",
  footgun: "warn",
  request: "default",
};

export default function FeedbackPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <SectionHeading
        eyebrow="required by the hackathon brief"
        title="What the API made possible — and where it got in the way"
        hint="CoinMarketCap asked for this explicitly and said the feedback goes straight to the product team. Everything below was encountered while building Parity against live data on the hackathon Startup tier."
      />

      <Panel className="px-5 py-5">
        <h2 className="text-sm font-medium text-fg">What the API made possible</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          One call — <code className="font-mono text-xs text-accent">/v5/real-world-assets/quotes/latest</code>{" "}
          — returns every wrapper for a tokenised asset as separate entries with their own price,
          market cap, volume and issuer. That single design decision is what makes Parity possible:
          before it, cross-issuer comparison meant scraping a dozen issuer dashboards. rwa_id as a
          stable identifier separate from crypto_id, the per-issuer lineage in issuers/list, the free
          map endpoint, and a genuinely generous 1-credit-per-250-assets pricing model for the RWA
          family all made a whole-universe screener economical at hackathon scale — Parity scans 250
          assets for two credits.
        </p>
      </Panel>

      <div className="space-y-3">
        {FINDINGS.map((finding, index) => (
          <Panel key={finding.title} className="px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="max-w-xl text-sm font-medium text-fg">
                <span className="mr-2 font-mono text-xs text-dim">{index + 1}</span>
                {finding.title}
              </h3>
              <Pill tone={severityTone[finding.severity]}>{finding.severity}</Pill>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted">{finding.detail}</p>
            {finding.repro ? (
              <code className="mt-3 block overflow-x-auto whitespace-pre rounded-md border border-line bg-inset px-3 py-2 font-mono text-[11px] text-dim">
                {finding.repro}
              </code>
            ) : null}
          </Panel>
        ))}
      </div>

      <Panel className="px-5 py-5">
        <h2 className="text-sm font-medium text-fg">If only one thing ships</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          The RWA historical series. Live wrapper prices without history forces every builder to
          architect around a gap — you either show a snapshot (and lose the retention loop) or you
          build your own time series and hope your reference alignment is right. With it, an entire
          class of tools — premium monitors, dislocation alerts, cost-of-wrapper attribution — becomes
          a few lines of code instead of a research project. The methodology that Parity uses to
          reconstruct it today is documented on the{" "}
          <InlineLink href="/methodology">methodology page</InlineLink>, limitations and all.
        </p>
      </Panel>
    </div>
  );
}

import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, Activity, Layers, ShieldCheck } from "lucide-react";
import { SearchBar } from "@/components/SearchBar";
import { BoardTable, DislocationStrip } from "@/components/BoardTable";
import { SignalChart } from "@/components/SignalChart";
import { Panel, SectionHeading, SkeletonRows, Pill, Stat } from "@/components/ui";
import { getBoard, getScreener, getAssetRaw } from "@/lib/services/assets";
import { buildHistory } from "@/lib/verdict/history";
import { fmtBps, fmtPct, fmtTimeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

const CHIPS = ["NVDA", "AAPL", "SPY", "GOLD", "TSLA", "MSTR", "QQQ", "SPCX"];

export default function HomePage() {
  return (
    <div className="space-y-10">
      <Hero />

      <Suspense fallback={<SectionSkeleton title="The biggest wrapper dislocations right now" />}>
        <DislocationSection />
      </Suspense>

      <Suspense fallback={<SectionSkeleton title="Fair-value board" rows={8} />}>
        <BoardSection />
      </Suspense>

      <Suspense fallback={<SectionSkeleton title="Why weekends matter" rows={4} />}>
        <WeekendSection />
      </Suspense>

      <HowItWorks />
    </div>
  );
}

function Hero() {
  return (
    <section className="pt-4 sm:pt-8">
      <div className="flex items-center gap-2">
        <Pill tone="accent">live · CoinMarketCap RWA API</Pill>
        <Pill>7,900+ tokenised assets tracked</Pill>
      </div>
      <h1 className="mt-5 max-w-3xl text-[34px] font-semibold leading-[1.1] tracking-tight sm:text-[44px]">
        The same Nvidia share.
        <br />
        <span className="text-muted">A dozen tokens. A dozen prices.</span>
      </h1>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted">
        Tokenised stocks, ETFs and gold trade across issuers and venues that never compare
        themselves to each other. Parity prices every wrapper against the real instrument — and
        against every rival wrapper — so you can see the premium before you pay it.
      </p>
      <div className="mt-6 max-w-xl">
        <SearchBar autoFocus placeholder="Check any tokenised asset — NVDA, SPY, GOLD, MSTR…" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {CHIPS.map((symbol) => (
          <Link
            key={symbol}
            href={`/asset/${symbol}`}
            className="rounded-md border border-line px-2.5 py-1 font-mono text-[11px] text-muted transition hover:border-accent/40 hover:text-accent"
          >
            {symbol}
          </Link>
        ))}
      </div>
    </section>
  );
}

function SectionSkeleton({ title, rows = 3 }: { title: string; rows?: number }) {
  return (
    <section>
      <SectionHeading title={title} />
      <SkeletonRows rows={rows} />
    </section>
  );
}

async function DislocationSection() {
  const screener = await getScreener();
  const rows = screener.rows.slice(0, 5);

  if (rows.length === 0) {
    return (
      <section>
        <SectionHeading title="The biggest wrapper dislocations right now" />
        <p className="text-sm text-muted">
          Screening is temporarily unavailable. The fair-value board below still works.
        </p>
      </section>
    );
  }

  return (
    <section>
      <SectionHeading
        eyebrow={`scanning ${screener.scanned} assets · ${fmtTimeAgo(screener.asOf)}`}
        title="The biggest wrapper dislocations right now"
        hint="Cross-issuer spread on identical exposure, from the full RWA universe. No external reference needed — both legs are tokenised claims."
        action={
          <Link
            href="/screener"
            className="flex items-center gap-1 text-xs text-accent transition hover:gap-2"
          >
            full screener <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
      />
      <DislocationStrip
        rows={rows.map((r) => ({
          symbol: r.symbol,
          name: r.name,
          spreadBps: r.spreadBps,
          bestSymbol: r.bestSymbol,
          worstSymbol: r.worstSymbol,
        }))}
      />
    </section>
  );
}

async function BoardSection() {
  const board = await getBoard();
  const top = board.assets.filter((a) => a.verdict !== "NO_DATA").slice(0, 10);

  return (
    <section>
      <SectionHeading
        eyebrow={`${board.assets.length} assets priced · ${board.universeSize.toLocaleString()} in the RWA universe · updated ${fmtTimeAgo(board.asOf)}`}
        title="Fair-value board"
        hint="Blended token price versus the underlying instrument. The premium is what you overpay (or underpay) versus owning the real thing."
      />
      <Panel className="px-4 py-3 sm:px-5">
        <BoardTable assets={top} dense />
      </Panel>
    </section>
  );
}

async function WeekendSection() {
  const asset = await getAssetRaw("NVDA");
  const history = asset ? await buildHistory(asset) : null;
  if (!history || history.spreads.length === 0) return null;

  const primary = history.spreads.reduce(
    (best, s) => (s.points.length > best.points.length ? s : best),
    history.spreads[0],
  );
  const stats = history.stats;
  const weekendPremium = stats.weekendMeanAbsPremiumPct;
  const weekdayPremium = stats.weekdayMeanAbsPremiumPct;
  const ratio =
    weekendPremium != null && weekdayPremium != null && weekdayPremium > 0
      ? weekendPremium / weekdayPremium
      : null;

  return (
    <section>
      <SectionHeading
        eyebrow={`${history.wrappers.length} wrappers · ${stats.windowStart} → ${stats.windowEnd}`}
        title="The market closes. The tokens keep trading."
        hint="When the underlying exchange is shut, the fair-value anchor freezes — and token prices drift. Weekends and holidays are where wrapper dislocations cluster."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel className="px-4 py-4 sm:px-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-fg">
              {primary.base} vs {primary.quote}
            </span>
            <Pill>cross-wrapper spread · bps</Pill>
            <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-dim">
              peak {fmtBps(stats.maxAbsSpreadBps)}
            </span>
          </div>
          <SignalChart
            series={[
              {
                label: `${primary.base} premium over ${primary.quote} (bps)`,
                color: "#d8ff3e",
                points: primary.points.map((p) => ({ date: p.date, value: p.bps })),
              },
            ]}
            weekendDates={history.weekendDates}
          />
        </Panel>

        <div className="space-y-4">
          <Panel className="px-5 py-4">
            <div className="grid grid-cols-2 gap-4">
              <Stat
                label="avg |premium| weekends"
                value={weekendPremium != null ? `${weekendPremium.toFixed(2)}%` : "—"}
                hint="reference frozen"
              />
              <Stat
                label="avg |premium| weekdays"
                value={weekdayPremium != null ? `${weekdayPremium.toFixed(2)}%` : "—"}
                hint="reference live"
              />
              <Stat
                label="dislocation episodes"
                value={`${stats.episodeCount}`}
                hint="days over 100 bps"
              />
              <Stat
                label="worst single day"
                value={stats.worstSpread ? fmtBps(stats.worstSpread.bps) : "—"}
                hint={stats.worstSpread?.date}
                tone="negative"
              />
            </div>
            {ratio ? (
              <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-muted">
                Across {history.wrappers.length} wrappers and {primary.points.length} sessions,
                dislocations are{" "}
                <span className="text-accent">{ratio.toFixed(1)}× wider on weekends</span> than
                during the trading week. That is the gap Parity exists to measure.
              </p>
            ) : null}
          </Panel>
          <Panel className="px-5 py-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-dim">
              worst premium vs underlying
            </div>
            {stats.worstPremium ? (
              <p className="mt-1 text-sm text-muted">
                <span className="font-mono text-fg">{stats.worstPremium.symbol}</span> traded{" "}
                <span className="font-mono text-over">
                  {fmtPct(stats.worstPremium.premiumPct)}
                </span>{" "}
                versus the underlying on{" "}
                <span className="font-mono text-fg">{stats.worstPremium.date}</span>.
              </p>
            ) : null}
            <Link
              href="/asset/NVDA"
              className="mt-3 inline-flex items-center gap-1 text-xs text-accent transition hover:gap-2"
            >
              open the full NVDA breakdown <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Panel>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: Layers,
      title: "Every wrapper, priced",
      body: "CMC's RWA quotes return each issuer's token separately — xStocks, Ondo, bStocks, Reality, Robinhood, Hyperliquid. Parity normalises units and ranks them.",
    },
    {
      icon: Activity,
      title: "Anchored to the real thing",
      body: "Each token is measured against the underlying's own last print, with the session and its age shown. No hidden staleness, no invented discounts.",
    },
    {
      icon: ShieldCheck,
      title: "Every claim is checkable",
      body: "Each verdict carries the raw CoinMarketCap response it came from. Open the evidence drawer and audit the maths yourself.",
    },
  ];
  return (
    <section>
      <SectionHeading title="How Parity decides" />
      <div className="grid gap-4 md:grid-cols-3">
        {steps.map((step) => (
          <Panel key={step.title} className="px-5 py-4">
            <step.icon className="h-4 w-4 text-accent" />
            <div className="mt-3 text-sm font-medium text-fg">{step.title}</div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">{step.body}</p>
          </Panel>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-xs">
        <Link href="/methodology" className="text-accent transition hover:opacity-80">
          Read the methodology →
        </Link>
        <Link href="/endpoints" className="text-accent transition hover:opacity-80">
          Endpoints used →
        </Link>
        <Link href="/feedback" className="text-accent transition hover:opacity-80">
          What the API made hard →
        </Link>
      </div>
    </section>
  );
}

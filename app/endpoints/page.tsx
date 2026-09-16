import { Panel, SectionHeading, Pill } from "@/components/ui";
import { creditUsage, listEvidence } from "@/lib/cmc/client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Endpoints used",
  description:
    "Every CoinMarketCap Pro API endpoint Parity calls, what each one contributes, and the credits it costs.",
};

interface EndpointRow {
  path: string;
  role: string;
  cost: string;
  cache: string;
}

const ENDPOINTS: EndpointRow[] = [
  {
    path: "/v5/real-world-assets/quotes/latest",
    role: "The core call. Returns every wrapper token for an asset with its own price, market cap, 24h volume and issuer — plus CMC's blended tokenized quote. This per-issuer split is what makes wrapper comparison possible at all.",
    cost: "1 credit per 250 assets",
    cache: "60s (CMC refreshes every 60s)",
  },
  {
    path: "/v5/real-world-assets/assets/list",
    role: "The universe. Ranks ~7,900 RWA assets by tokenized volume, giving the screener and the fair-value board their candidate set, plus CMC's own aggregate tokenized price/market cap/volume per asset.",
    cost: "1 credit per 250 assets",
    cache: "60s",
  },
  {
    path: "/v5/real-world-assets/map",
    role: "Stable identifier resolution. rwa_id lookups for search and for pinning evidence to a canonical asset rather than a ticker string.",
    cost: "free (no credits)",
    cache: "30s",
  },
  {
    path: "/v5/real-world-assets/info",
    role: "Static metadata for the asset page: industry, employees, founding date, SEC CIK, description and website.",
    cost: "1 credit per 250 assets",
    cache: "60s",
  },
  {
    path: "/v5/real-world-assets/issuers/list",
    role: "Lineage. Maps the issuers behind each wrapper (Backed, Ondo, bStocks, Paxos…) and exposes how many tokens each issuer has listed.",
    cost: "1 credit per request",
    cache: "60s",
  },
  {
    path: "/v2/cryptocurrency/ohlcv/historical",
    role: "Dislocation history. Daily closes per wrapper token, joined against the underlying's own daily closes to build the premium and cross-wrapper spread series — something the RWA family has no endpoint for yet.",
    cost: "1 credit per ~100 data points",
    cache: "6h",
  },
];

export default function EndpointsPage() {
  const usage = creditUsage();
  const recent = listEvidence(12);

  return (
    <div className="max-w-3xl space-y-8">
      <SectionHeading
        eyebrow="submission requirement · endpoints named explicitly"
        title="Endpoints used"
        hint="Six endpoints across two families. Everything below runs on the free/Startup tier available to hackathon participants."
        action={
          <div className="flex gap-2">
            <Pill tone="accent">{usage.requests} requests</Pill>
            <Pill>{usage.credits} credits this session</Pill>
          </div>
        }
      />

      <div className="space-y-3">
        {ENDPOINTS.map((endpoint) => (
          <Panel key={endpoint.path} className="px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <code className="font-mono text-xs text-accent">{endpoint.path}</code>
              <div className="flex items-center gap-2">
                <Pill>{endpoint.cost}</Pill>
                <Pill>{endpoint.cache}</Pill>
              </div>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted">{endpoint.role}</p>
          </Panel>
        ))}
      </div>

      <Panel className="px-5 py-5">
        <h2 className="text-sm font-medium text-fg">Visible evidence of real calls</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Every rendered number on Parity links back to the exact upstream response. Asset pages carry
          an evidence drawer with the request, HTTP status, credit count and raw JSON envelope. The
          most recent calls from this server process are below — hit any asset page for the full set.
        </p>
        {recent.length === 0 ? (
          <p className="mt-3 text-xs text-dim">
            No calls recorded in this process yet. Open the board to populate the buffer.
          </p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {recent.map((e) => (
              <li
                key={`${e.id}-${e.requestedAt}`}
                className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-inset/60 px-3 py-1.5 font-mono text-[10px]"
              >
                <span className="text-fg">{e.label}</span>
                {e.cacheHit ? (
                  <span className="text-dim">cache hit</span>
                ) : (
                  <span className="text-accent">live</span>
                )}
                <span className="text-muted">HTTP {e.httpStatus}</span>
                <span className="text-dim">{e.creditCount} cr</span>
                <span className="ml-auto text-dim">
                  {new Date(e.requestedAt).toISOString().slice(11, 19)} UTC
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs leading-relaxed text-dim">
          The API key is read from the server environment only. It is never written to the cache, the
          evidence buffer, the browser bundle, or the repository — evidence records store the URL with
          the key redacted and a copy-paste curl that reads it from an environment variable.
        </p>
      </Panel>
    </div>
  );
}

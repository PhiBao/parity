import { Panel, SectionHeading, Pill } from "@/components/ui";
import { CodeBlock } from "@/components/CodeBlock";
import { McpTester } from "@/components/McpTester";
import { TOOLS } from "@/lib/mcp/tools";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "MCP server — drive Parity from any agent",
  description:
    "Parity exposes its verdicts, wrapper spreads, screener and history as MCP tools. Point any agent at POST /api/mcp, or try the tools live below.",
};

const APP_URL = "https://parity-xi.vercel.app";

export default function McpPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <SectionHeading
        eyebrow="model context protocol · streamable http · no auth"
        title="Drive Parity from any agent"
        hint="The same engine behind the web app, exposed as five MCP tools. Stateless, read-only, no API key to manage — the CoinMarketCap key never leaves the server."
        action={
          <div className="flex gap-2">
            <Pill tone="accent">POST /api/mcp</Pill>
            <Pill>5 tools</Pill>
          </div>
        }
      />

      <Panel className="px-5 py-5">
        <h2 className="text-sm font-medium text-fg">Connect in 30 seconds</h2>
        <div className="mt-3 space-y-3">
          <div>
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
              claude code
            </div>
            <CodeBlock
              language="bash"
              code={`claude mcp add --transport http parity ${APP_URL}/api/mcp`}
            />
          </div>
          <div>
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
              cursor / claude desktop / any mcp client
            </div>
            <CodeBlock
              code={JSON.stringify(
                { mcpServers: { parity: { url: `${APP_URL}/api/mcp` } } },
                null,
                2,
              )}
            />
          </div>
          <div>
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
              mcp inspector
            </div>
            <CodeBlock
              language="bash"
              code={`npx @modelcontextprotocol/inspector --cli ${APP_URL}/api/mcp --transport http --method tools/list`}
            />
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-dim">
          Then ask things like “is tokenised NVDA rich right now?”, “which SPY wrapper is cheapest
          after dividends?” or “what are the biggest wrapper dislocations today?”. The agent plans
          the calls; Parity does the maths.
        </p>
      </Panel>

      <div>
        <SectionHeading title="Try it live" hint="A real MCP client in your browser — it discovers the tools from the server, then speaks JSON-RPC to the same endpoint your agent would use." />
        <McpTester />
      </div>

      <div>
        <SectionHeading
          title="The tools"
          hint="Rendered from the same definitions the server advertises — what you see is what tools/list returns."
        />
        <div className="space-y-3">
          {TOOLS.map((tool) => (
            <Panel key={tool.name} className="px-5 py-4">
              <code className="font-mono text-xs text-accent">{tool.name}</code>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{tool.description}</p>
              <CodeBlock code={JSON.stringify(tool.inputSchema, null, 2)} />
            </Panel>
          ))}
        </div>
      </div>

      <Panel className="px-5 py-5">
        <h2 className="text-sm font-medium text-fg">Design notes</h2>
        <ul className="mt-2 space-y-2 text-sm leading-relaxed text-muted">
          <li>
            <span className="text-fg">Stateless.</span> No sessions, no SSE — every request is a
            self-contained JSON-RPC message, which keeps the endpoint trivially cacheable and
            horizontally scalable.
          </li>
          <li>
            <span className="text-fg">Same numbers as the web.</span> Tools call the same cached
            services, including dividend-accrual adjustment and the same eligibility pipeline — an
            agent and a human never disagree about a price.
          </li>
          <li>
            <span className="text-fg">Honest errors.</span> Unknown tickers and empty results come
            back as tool-level errors with a suggestion, not protocol failures — agents can recover
            and retry.
          </li>
          <li>
            <span className="text-fg">Bounded outputs.</span> History series are capped, the
            screener is capped at 25 rows, symbols are validated — a curious agent cannot turn the
            endpoint into an expensive scrape.
          </li>
        </ul>
      </Panel>
    </div>
  );
}

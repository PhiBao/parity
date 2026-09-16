"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FlaskConical, Play, ChevronDown, Copy } from "lucide-react";

interface ToolParam {
  name: string;
  type: string;
  description?: string;
  default?: unknown;
  required: boolean;
}

interface ToolInfo {
  name: string;
  description: string;
  params: ToolParam[];
}

interface CallRecord {
  request: unknown;
  response: unknown;
  latencyMs: number;
}

let rpcId = 100;

async function rpc(method: string, params: unknown): Promise<{ data: unknown; ms: number }> {
  const started = performance.now();
  const res = await fetch("/api/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const data = (await res.json()) as unknown;
  return { data, ms: Math.round(performance.now() - started) };
}

/**
 * A live MCP client in the browser: discovers tools from the server on load,
 * builds the params form from each tool's schema, and shows the exact
 * JSON-RPC wire traffic alongside the result. If this panel works, any
 * MCP-compatible agent can drive the same endpoint.
 */
export function McpTester() {
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [protocol, setProtocol] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [record, setRecord] = useState<CallRecord | null>(null);
  const [running, setRunning] = useState(false);
  const [wireOpen, setWireOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const initOnce = useRef(false);

  const current = tools.find((t) => t.name === selected) ?? null;

  useEffect(() => {
    if (initOnce.current) return;
    initOnce.current = true;
    (async () => {
      try {
        const init = (await rpc("initialize", {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "parity-web-tester", version: "1.0" },
        })) as { data: { result?: { protocolVersion?: string } } };
        setProtocol(init.data.result?.protocolVersion ?? null);
        await rpc("notifications/initialized", {}).catch(() => null);
        const list = (await rpc("tools/list", {})) as {
          data: { result?: { tools?: { name: string; description: string; inputSchema?: { properties?: Record<string, { type?: string; description?: string; default?: unknown }>; required?: string[] } }[] } };
        };
        const discovered: ToolInfo[] = (list.data.result?.tools ?? []).map((t) => {
          const props = t.inputSchema?.properties ?? {};
          const required = new Set(t.inputSchema?.required ?? []);
          return {
            name: t.name,
            description: t.description,
            params: Object.entries(props).map(([name, schema]) => ({
              name,
              type: schema.type ?? "string",
              description: schema.description,
              default: schema.default,
              required: required.has(name),
            })),
          };
        });
        setTools(discovered);
        if (discovered.length > 0) {
          setSelected(discovered[0].name);
          const seed: Record<string, string> = {};
          for (const p of discovered[0].params) {
            if (p.default !== undefined) seed[p.name] = String(p.default);
          }
          if (discovered[0].name === "parity_fair_value") seed.symbol = "NVDA";
          setValues(seed);
        }
      } catch {
        /* endpoint unreachable — the panel shows the empty state */
      }
    })();
  }, []);

  const pick = useCallback(
    (name: string) => {
      setSelected(name);
      setRecord(null);
      const tool = tools.find((t) => t.name === name);
      const seed: Record<string, string> = {};
      for (const p of tool?.params ?? []) {
        if (p.default !== undefined) seed[p.name] = String(p.default);
      }
      if (name === "parity_fair_value") seed.symbol = "NVDA";
      if (name === "parity_spread") seed.symbol = "NVDA";
      if (name === "parity_history") seed.symbol = "NVDA";
      if (name === "parity_search") seed.query = "nvidia";
      setValues(seed);
    },
    [tools],
  );

  async function run() {
    if (!current || running) return;
    setRunning(true);
    setWireOpen(false);
    try {
      const args: Record<string, unknown> = {};
      for (const p of current.params) {
        const raw = (values[p.name] ?? "").trim();
        if (raw === "") continue;
        args[p.name] = p.type === "number" ? Number(raw) : raw;
      }
      const request = {
        jsonrpc: "2.0",
        id: rpcId + 1,
        method: "tools/call",
        params: { name: current.name, arguments: args },
      };
      const { data, ms } = await rpc("tools/call", { name: current.name, arguments: args });
      setRecord({ request, response: data, latencyMs: ms });
    } catch (error) {
      setRecord({
        request: { method: "tools/call", params: { name: current?.name } },
        response: { error: error instanceof Error ? error.message : "Request failed" },
        latencyMs: 0,
      });
    } finally {
      setRunning(false);
    }
  }

  async function copyWire() {
    if (!record) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(record.response, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  const result = (record?.response as { result?: { content?: { text?: string }[]; structuredContent?: unknown; isError?: boolean }; error?: { message?: string } } | null)?.result;
  const protocolError = (record?.response as { error?: { code?: number; message?: string } } | null)?.error;
  const summaryText = result?.content?.[0]?.text ?? null;

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-elevated/80">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-3.5 w-3.5 text-accent" />
          <span className="text-sm font-medium text-fg">Try it live</span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
          {tools.length === 0
            ? "connecting…"
            : `handshake ok · protocol ${protocol ?? "?"} · ${tools.length} tools discovered`}
        </span>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-4 border-b border-line px-5 py-4 lg:border-b-0 lg:border-r">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-dim">tool</div>
            <div className="mt-2 grid gap-1.5">
              {tools.map((t) => (
                <button
                  key={t.name}
                  onClick={() => pick(t.name)}
                  className={`rounded-md border px-2.5 py-1.5 text-left font-mono text-xs transition ${
                    t.name === selected
                      ? "border-accent/50 bg-accent/10 text-accent"
                      : "border-line bg-inset/60 text-muted hover:border-line-strong hover:text-fg"
                  }`}
                >
                  {t.name}
                </button>
              ))}
              {tools.length === 0 ? (
                <p className="text-xs text-dim">
                  Waiting for the endpoint — if this never resolves, POST /api/mcp is unreachable
                  from your browser.
                </p>
              ) : null}
            </div>
          </div>

          {current ? (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-dim">
                arguments
              </div>
              <p className="mt-1 text-xs leading-relaxed text-dim">{current.description}</p>
              <div className="mt-2 space-y-2">
                {current.params.length === 0 ? (
                  <p className="text-xs text-dim">No arguments.</p>
                ) : (
                  current.params.map((p) => (
                    <label key={p.name} className="block">
                      <span className="flex items-baseline justify-between text-xs">
                        <span className="font-mono text-fg">
                          {p.name}
                          {p.required ? <span className="text-over"> *</span> : null}
                        </span>
                        <span className="font-mono text-[10px] text-dim">{p.type}</span>
                      </span>
                      {p.description ? (
                        <span className="mt-0.5 block text-[11px] text-dim">{p.description}</span>
                      ) : null}
                      <input
                        value={values[p.name] ?? ""}
                        onChange={(e) => setValues((v) => ({ ...v, [p.name]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void run();
                        }}
                        placeholder={p.default !== undefined ? String(p.default) : "—"}
                        inputMode={p.type === "number" ? "decimal" : "text"}
                        className="mt-1 w-full rounded-md border border-line bg-inset px-2.5 py-1.5 font-mono text-xs text-fg outline-none focus:border-accent/50"
                      />
                    </label>
                  ))
                )}
              </div>
              <button
                onClick={() => void run()}
                disabled={running}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-2 text-xs font-medium text-accent transition hover:bg-accent/20 disabled:opacity-40"
              >
                <Play className={`h-3.5 w-3.5 ${running ? "animate-pulse" : ""}`} />
                {running ? "calling…" : `call ${current.name}`}
              </button>
            </div>
          ) : null}
        </div>

        <div className="px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-dim">result</div>
            {record ? (
              <span className="font-mono text-[10px] text-dim">{record.latencyMs} ms</span>
            ) : null}
          </div>

          {!record ? (
            <p className="mt-2 text-xs leading-relaxed text-dim">
              Pick a tool, fill in the arguments and run it. The call goes to{" "}
              <code className="font-mono text-[11px] text-muted">POST /api/mcp</code> as JSON-RPC —
              the same wire format Claude Code, Cursor or the MCP Inspector would speak.
            </p>
          ) : protocolError ? (
            <div className="mt-2 rounded-md border border-over/40 bg-over/10 px-3 py-2 text-xs text-over">
              Protocol error {protocolError.code}: {protocolError.message}
            </div>
          ) : result?.isError ? (
            <div className="mt-2 rounded-md border border-dispersion/40 bg-dispersion/10 px-3 py-2 text-xs text-dispersion">
              {summaryText ?? "Tool reported an error."}
            </div>
          ) : (
            <div className="mt-2 space-y-3">
              {summaryText ? (
                <p className="text-[13px] leading-relaxed text-fg">{summaryText}</p>
              ) : null}
              {result?.structuredContent != null ? (
                <pre className="max-h-80 overflow-auto rounded-md border border-line bg-inset p-3 font-mono text-[11px] leading-relaxed text-muted">
                  {JSON.stringify(result.structuredContent, null, 2)}
                </pre>
              ) : null}
            </div>
          )}

          {record ? (
            <div className="mt-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setWireOpen((o) => !o)}
                  className="flex items-center gap-1 text-[11px] text-dim transition hover:text-fg"
                >
                  <ChevronDown className={`h-3 w-3 transition ${wireOpen ? "rotate-180" : ""}`} />
                  wire format
                </button>
                <button
                  onClick={() => void copyWire()}
                  className="flex items-center gap-1 text-[11px] text-dim transition hover:text-fg"
                >
                  <Copy className="h-3 w-3" />
                  {copied ? "copied" : "copy response"}
                </button>
              </div>
              {wireOpen ? (
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-wider text-dim">
                      request
                    </div>
                    <pre className="mt-1 max-h-56 overflow-auto rounded-md border border-line bg-inset p-2.5 font-mono text-[10px] leading-relaxed text-muted">
                      {JSON.stringify(record.request, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-wider text-dim">
                      response
                    </div>
                    <pre className="mt-1 max-h-56 overflow-auto rounded-md border border-line bg-inset p-2.5 font-mono text-[10px] leading-relaxed text-muted">
                      {JSON.stringify(record.response, null, 2)}
                    </pre>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

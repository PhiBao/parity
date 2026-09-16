"use client";

import { useState } from "react";
import { ChevronDown, Copy, ShieldCheck } from "lucide-react";
import type { EvidenceSummary } from "@/lib/cmc/client";

interface EvidenceBody {
  id: string;
  label: string;
  url: string;
  curl: string;
  requestedAt: string;
  httpStatus: number;
  creditCount: number;
  errorCode: number | string | null;
  errorMessage: string | null;
  cacheHit: boolean;
  responseBody: unknown;
}

export function EvidenceDrawer({
  evidence,
  title = "Evidence",
  description,
}: {
  evidence: EvidenceSummary[];
  title?: string;
  description?: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [bodies, setBodies] = useState<Record<string, EvidenceBody | "loading" | "error">>({});
  const [copied, setCopied] = useState<string | null>(null);

  async function toggle(id: string) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    if (!bodies[id]) {
      setBodies((prev) => ({ ...prev, [id]: "loading" }));
      try {
        const res = await fetch(`/api/evidence/${id}`);
        if (!res.ok) throw new Error("expired");
        const body = (await res.json()) as EvidenceBody;
        setBodies((prev) => ({ ...prev, [id]: body }));
      } catch {
        setBodies((prev) => ({ ...prev, [id]: "error" }));
      }
    }
  }

  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  const totalCredits = evidence.reduce((sum, e) => sum + e.creditCount, 0);

  return (
    <div className="rounded-xl border border-line bg-elevated/80">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-accent" />
            <span className="text-sm font-medium text-fg">{title}</span>
          </div>
          <p className="mt-1 max-w-2xl text-xs text-muted">
            {description ??
              "Every number on this page is computed from the API responses below. Expand any row to see the exact request and raw payload — the API key is never exposed."}
          </p>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
          {evidence.length} calls · {totalCredits} credits
        </div>
      </div>

      <ul className="divide-y divide-line/60">
        {evidence.map((e) => {
          const body = bodies[e.id];
          const expanded = openId === e.id;
          return (
            <li key={e.id}>
              <button
                onClick={() => toggle(e.id)}
                className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition hover:bg-white/[0.02]"
              >
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 text-dim transition ${expanded ? "rotate-180" : ""}`}
                />
                <span className="font-mono text-[11px] text-fg">{e.label}</span>
                <span className="ml-auto flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider">
                  {e.cacheHit ? (
                    <span className="rounded border border-line px-1.5 py-0.5 text-dim">cache</span>
                  ) : (
                    <span className="rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-accent">
                      live call
                    </span>
                  )}
                  <span className="text-muted">HTTP {e.httpStatus}</span>
                  <span className="text-dim">{e.creditCount} cr</span>
                </span>
              </button>

              {expanded ? (
                <div className="space-y-3 px-5 pb-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre rounded-md border border-line bg-inset px-3 py-2 font-mono text-[11px] text-muted">
                      {e.curl}
                    </code>
                    <button
                      onClick={() => copy(e.curl, e.id)}
                      className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1.5 text-[11px] text-muted transition hover:border-line-strong hover:text-fg"
                    >
                      <Copy className="h-3 w-3" />
                      {copied === e.id ? "copied" : "copy curl"}
                    </button>
                  </div>

                  {body === "loading" ? (
                    <div className="h-24 rounded-md shimmer" />
                  ) : body === "error" || !body ? (
                    <p className="rounded-md border border-dashed border-line px-3 py-2 text-xs text-dim">
                      Evidence expired from the server buffer. Reload the page to capture a fresh
                      call.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-dim">
                        <span>requested {new Date(body.requestedAt).toISOString()}</span>
                        <span>error_code {String(body.errorCode)}</span>
                      </div>
                      <pre className="max-h-72 overflow-auto rounded-md border border-line bg-inset p-3 font-mono text-[11px] leading-relaxed text-muted">
                        {JSON.stringify(body.responseBody, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

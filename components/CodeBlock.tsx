"use client";

import { useState } from "react";
import { Copy } from "lucide-react";

export function CodeBlock({ code, language = "json" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className="relative overflow-hidden rounded-lg border border-line bg-inset">
      <button
        onClick={() => void copy()}
        className="absolute right-2 top-2 flex items-center gap-1 rounded border border-line bg-elevated px-1.5 py-1 font-mono text-[10px] text-dim transition hover:border-line-strong hover:text-fg"
      >
        <Copy className="h-3 w-3" />
        {copied ? "copied" : language}
      </button>
      <pre className="overflow-x-auto p-3 pr-16 font-mono text-[11px] leading-relaxed text-muted">
        {code}
      </pre>
    </div>
  );
}

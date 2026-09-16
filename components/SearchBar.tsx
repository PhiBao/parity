"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import type { SearchResult } from "@/lib/services/assets";

export function SearchBar({
  compact = false,
  autoFocus = false,
  placeholder,
}: {
  compact?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("search failed");
        const data = (await res.json()) as { results: SearchResult[] };
        setResults(data.results ?? []);
        setActive(0);
        setOpen(true);
      } catch {
        /* aborted or offline — keep the last results */
      } finally {
        setLoading(false);
      }
    }, 160);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function go(symbol: string) {
    setOpen(false);
    setQuery("");
    router.push(`/asset/${encodeURIComponent(symbol)}`);
  }

  return (
    <div ref={boxRef} className="relative w-full">
      <div
        className={`flex items-center gap-2 rounded-lg border border-line bg-inset/80 px-2.5 transition focus-within:border-accent/50 ${
          compact ? "h-9" : "h-12"
        }`}
      >
        <Search className={compact ? "h-3.5 w-3.5 text-dim" : "h-4 w-4 text-dim"} />
        <input
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => {
            const next = e.target.value;
            setQuery(next);
            if (next.trim().length === 0) {
              setResults([]);
              setLoading(false);
              setOpen(false);
            }
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (results[active]) go(results[active].symbol);
              else if (query.trim()) go(query.trim().toUpperCase());
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={placeholder ?? "Search a tokenised asset — NVDA, SPY, GOLD…"}
          className={`w-full bg-transparent text-fg outline-none placeholder:text-dim ${
            compact ? "text-sm" : "text-[15px]"
          }`}
          aria-label="Search tokenised assets"
        />
        {loading ? (
          <span className="font-mono text-[10px] uppercase tracking-wider text-dim">…</span>
        ) : null}
      </div>

      {open && results.length > 0 ? (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-lg border border-line bg-elevated shadow-2xl shadow-black/60">
          {results.map((r, i) => (
            <button
              key={r.symbol}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(r.symbol)}
              className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition ${
                i === active ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="font-mono text-xs text-fg">{r.symbol}</span>
                <span className="truncate text-xs text-muted">{r.name}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                {r.hasReference ? (
                  <span className="rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-accent">
                    fair value
                  </span>
                ) : null}
                <span className="font-mono text-[10px] uppercase tracking-wider text-dim">
                  {r.assetType}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

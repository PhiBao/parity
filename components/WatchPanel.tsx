"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, Plus, RefreshCw, Trash2 } from "lucide-react";
import { fmtPct } from "@/lib/format";
import { useLocalStorageJson } from "@/lib/useLocalStorage";

export interface WatchItem {
  symbol: string;
  op: "above" | "below";
  thresholdPct: number;
}

interface TriggerLogEntry {
  symbol: string;
  at: string;
  premiumPct: number | null;
  reason: string;
}

interface Evaluation {
  symbol: string;
  premiumPct: number | null;
  verdict: string;
  confidence: string;
  bestWrapper: string | null;
  spreadBps: number | null;
  triggered: boolean;
  reason: string;
  evaluatedAt: string;
}

const WATCH_KEY = "parity.watchlist.v1";
const LOG_KEY = "parity.triggerlog.v1";
const EMPTY_WATCH: WatchItem[] = [];
const EMPTY_LOG: TriggerLogEntry[] = [];

export function WatchPanel({ symbol }: { symbol: string }) {
  const [items, setItems, itemsRaw] = useLocalStorageJson<WatchItem[]>(WATCH_KEY, EMPTY_WATCH);
  const [log, setLog] = useLocalStorageJson<TriggerLogEntry[]>(LOG_KEY, EMPTY_LOG);

  const [op, setOp] = useState<"above" | "below">("above");
  const [threshold, setThreshold] = useState("1");
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [evaluating, setEvaluating] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const lastEvaluatedRef = useRef<string>("");

  const evaluate = useCallback(
    async (list: WatchItem[]) => {
      if (list.length === 0) return;
      // Yield before touching state so callers inside effects never cascade a
      // synchronous render; the network call starts immediately after.
      await Promise.resolve();
      setEvaluating(true);
      try {
        const res = await fetch("/api/watch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: list }),
        });
        if (!res.ok) throw new Error("evaluation failed");
        const data = (await res.json()) as { evaluations: Evaluation[]; evaluatedAt: string };
        setEvaluations(data.evaluations);
        setLastRun(data.evaluatedAt);

        const triggered = data.evaluations.filter((e) => e.triggered);
        if (triggered.length > 0) {
          const prior = JSON.parse(
            window.localStorage.getItem(LOG_KEY) ?? "[]",
          ) as TriggerLogEntry[];
          const nextLog = [
            ...triggered.map((e) => ({
              symbol: e.symbol,
              at: e.evaluatedAt,
              premiumPct: e.premiumPct,
              reason: e.reason,
            })),
            ...prior,
          ].slice(0, 40);
          setLog(nextLog);
        }
      } catch {
        /* keep the previous evaluation visible */
      } finally {
        setEvaluating(false);
      }
    },
    [setLog],
  );

  // Re-evaluate whenever the stored watchlist actually changes value.
  useEffect(() => {
    if (!itemsRaw || items.length === 0) return;
    if (lastEvaluatedRef.current === itemsRaw) return;
    lastEvaluatedRef.current = itemsRaw;
    void evaluate(items);
  }, [itemsRaw, items, evaluate]);

  function add() {
    const value = Number(threshold);
    if (!Number.isFinite(value)) return;
    const next = [...items.filter((i) => i.symbol !== symbol), { symbol, op, thresholdPct: value }];
    setItems(next);
    void evaluate(next);
  }

  function remove(target: string) {
    const next = items.filter((i) => i.symbol !== target);
    setItems(next);
    setEvaluations((prev) => prev.filter((e) => e.symbol !== target));
  }

  const mine = evaluations.find((e) => e.symbol === symbol);

  return (
    <div className="rounded-xl border border-line bg-elevated/80">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
        <div className="flex items-center gap-2">
          <BellRing className="h-3.5 w-3.5 text-accent" />
          <span className="text-sm font-medium text-fg">Alerts</span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
          evaluated server-side on live data · stored in your browser
        </span>
      </div>

      <div className="space-y-4 px-5 py-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-dim">
            Tell me when {symbol} premium is
            <select
              value={op}
              onChange={(e) => setOp(e.target.value as "above" | "below")}
              className="mx-2 rounded-md border border-line bg-inset px-2 py-1.5 text-xs text-fg outline-none focus:border-accent/50"
            >
              <option value="above">above</option>
              <option value="below">below</option>
            </select>
          </label>
          <div className="flex items-center gap-1">
            <input
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              inputMode="decimal"
              className="w-16 rounded-md border border-line bg-inset px-2 py-1.5 text-right font-mono text-xs text-fg outline-none focus:border-accent/50"
            />
            <span className="text-xs text-dim">%</span>
          </div>
          <button
            onClick={add}
            className="flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/20"
          >
            <Plus className="h-3.5 w-3.5" />
            Watch {symbol}
          </button>
          <button
            onClick={() => void evaluate(items)}
            disabled={evaluating || items.length === 0}
            className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs text-muted transition hover:border-line-strong hover:text-fg disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${evaluating ? "animate-spin" : ""}`} />
            Re-evaluate
          </button>
        </div>

        {mine ? (
          <div
            className={`rounded-lg border px-3 py-2 text-xs ${
              mine.triggered
                ? "border-dispersion/40 bg-dispersion/10 text-dispersion"
                : "border-line bg-inset/60 text-muted"
            }`}
          >
            <span className="font-mono uppercase tracking-wider">
              {mine.triggered ? "triggered" : "watching"}
            </span>{" "}
            — {mine.reason}{" "}
            {mine.bestWrapper ? (
              <span className="text-dim">cheapest route: {mine.bestWrapper}</span>
            ) : null}
          </div>
        ) : null}

        {items.length > 0 ? (
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
              your watchlist
            </div>
            <ul className="mt-2 space-y-1.5">
              {items.map((item) => {
                const evaluation = evaluations.find((e) => e.symbol === item.symbol);
                return (
                  <li
                    key={item.symbol}
                    className="flex items-center justify-between gap-3 rounded-md border border-line bg-inset/60 px-3 py-1.5"
                  >
                    <span className="font-mono text-[11px] text-fg">{item.symbol}</span>
                    <span className="text-[11px] text-dim">
                      {item.op} {item.thresholdPct}%
                    </span>
                    <span className="font-mono text-[11px] tabular text-muted">
                      now {fmtPct(evaluation?.premiumPct ?? null)}
                    </span>
                    <button
                      onClick={() => remove(item.symbol)}
                      className="text-dim transition hover:text-over"
                      aria-label={`Remove ${item.symbol}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-dim">
            No alerts yet. Alerts are evaluated against live CoinMarketCap data every time this page
            loads — no account needed.
          </p>
        )}

        {log.length > 0 ? (
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
              trigger log
              {lastRun ? ` · last run ${new Date(lastRun).toISOString().slice(11, 19)} UTC` : ""}
            </div>
            <ul className="mt-2 space-y-1 text-[11px] text-muted">
              {log.slice(0, 6).map((entry, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-dispersion" />
                  <span className="font-mono text-dim">
                    {new Date(entry.at).toISOString().slice(0, 16).replace("T", " ")}Z
                  </span>
                  <span className="font-mono text-fg">{entry.symbol}</span>
                  <span>{fmtPct(entry.premiumPct)}</span>
                  <span className="truncate text-dim">{entry.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

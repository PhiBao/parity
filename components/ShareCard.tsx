"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Link2 } from "lucide-react";
import { fmtPct, fmtPrice, VERDICT_LABEL } from "@/lib/format";

export interface ShareCardProps {
  symbol: string;
  name: string;
  verdict: string;
  premiumPct: number | null;
  spreadBps: number | null;
  referenceSymbol: string | null;
  referencePrice: number | null;
  cheapest: string | null;
  dearest: string | null;
  sparkline: number[];
}

const W = 1200;
const H = 630;

function toneFor(verdict: string): string {
  switch (verdict) {
    case "OVERPRICED":
      return "#ff6f61";
    case "DISCOUNT":
      return "#4ade80";
    case "DISPERSION":
      return "#fbbf24";
    case "RELATIVE":
      return "#c4b5fd";
    case "ILLIQUID":
      return "#94a3b8";
    default:
      return "#e5e7eb";
  }
}

/**
 * Renders the verdict to a shareable image on-device (no server, no upload).
 * The X post is part of the submission requirements, so making the artifact
 * is a first-class product feature rather than an afterthought.
 */
export function ShareCard(props: ShareCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#07080a";
    ctx.fillRect(0, 0, W, H);

    const grad = ctx.createRadialGradient(W / 2, -150, 50, W / 2, -150, 700);
    grad.addColorStop(0, "rgba(216,255,62,0.12)");
    grad.addColorStop(1, "rgba(216,255,62,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);

    // brand
    ctx.fillStyle = "#d8ff3e";
    ctx.beginPath();
    ctx.arc(78, 74, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f4f5f7";
    ctx.font = "600 28px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("Parity", 98, 84);
    ctx.fillStyle = "#6b7280";
    ctx.font = "500 16px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText("FAIR-PRICE CHECK FOR TOKENISED STOCKS", 98, 108);

    const tone = toneFor(props.verdict);

    // asset
    ctx.fillStyle = "#9aa1ab";
    ctx.font = "500 20px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(props.symbol, 78, 186);
    ctx.fillStyle = "#f4f5f7";
    ctx.font = "500 30px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(props.name.slice(0, 42), 78, 222);

    // verdict pill
    const label = (VERDICT_LABEL[props.verdict] ?? props.verdict).toUpperCase();
    ctx.font = "600 18px ui-monospace, SFMono-Regular, Menlo, monospace";
    const labelWidth = ctx.measureText(label).width;
    ctx.strokeStyle = tone;
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.beginPath();
    ctx.roundRect(W - 78 - labelWidth - 56, 180, labelWidth + 56, 44, 22);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = tone;
    ctx.beginPath();
    ctx.arc(W - 78 - labelWidth - 32, 202, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText(label, W - 78 - labelWidth - 16, 208);

    // big number
    const headline =
      props.premiumPct != null
        ? fmtPct(props.premiumPct)
        : props.spreadBps != null
          ? `${props.spreadBps} bps`
          : "—";
    ctx.fillStyle = tone;
    ctx.font = "700 132px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(headline, 70, 380);

    ctx.fillStyle = "#9aa1ab";
    ctx.font = "400 22px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(
      props.premiumPct != null
        ? `blended token premium vs ${props.referenceSymbol ?? "TradFi reference"}`
        : "spread between cheapest and dearest wrapper",
      78,
      420,
    );

    // sparkline
    if (props.sparkline.length > 4) {
      const max = Math.max(...props.sparkline.map(Math.abs), 1);
      const x0 = 78;
      const chartW = W - 156;
      const y0 = 452;
      const chartH = 58;
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, y0 + chartH / 2);
      ctx.lineTo(x0 + chartW, y0 + chartH / 2);
      ctx.stroke();

      ctx.strokeStyle = "#d8ff3e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      props.sparkline.forEach((value, i) => {
        const x = x0 + (i / (props.sparkline.length - 1)) * chartW;
        const y = y0 + chartH / 2 - (value / max) * (chartH / 2 - 4);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // footer stats
    ctx.fillStyle = "#6b7280";
    ctx.font = "500 18px ui-monospace, SFMono-Regular, Menlo, monospace";
    const footLeft = [
      props.cheapest ? `CHEAPEST ${props.cheapest}` : null,
      props.dearest ? `DEAREST ${props.dearest}` : null,
      props.referencePrice != null ? `REF ${fmtPrice(props.referencePrice)}` : null,
    ]
      .filter(Boolean)
      .join("   ·   ");
    ctx.fillText(footLeft, 78, 560);

    ctx.fillStyle = "#4b5563";
    ctx.font = "500 16px ui-monospace, SFMono-Regular, Menlo, monospace";
    const host =
      typeof window !== "undefined" ? window.location.host.toUpperCase() : "PARITY";
    ctx.fillText(`COINMARKETCAP RWA API · ${host}`, 78, 596);

    setReady(true);
  }, [props]);

  useEffect(() => {
    draw();
  }, [draw]);

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `parity-${props.symbol.toLowerCase()}.png`;
    a.click();
  }

  function caption(): string {
    const line =
      props.premiumPct != null
        ? `${props.symbol} tokenised is trading ${fmtPct(props.premiumPct)} vs ${props.referenceSymbol ?? "its reference"}`
        : `${props.symbol} wrappers are ${props.spreadBps ?? 0} bps apart`;
    const cheapest = props.cheapest ? ` Cheapest route: ${props.cheapest}.` : "";
    return `${line}.${cheapest} Check any tokenised stock before you buy — @CoinMarketCap RWA data. #BuildwithCMC`;
  }

  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(caption());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className="rounded-xl border border-line bg-elevated/80 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-fg">Share this call</div>
          <p className="mt-0.5 text-xs text-muted">
            Rendered locally in your browser. Nothing is uploaded.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyCaption}
            className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs text-muted transition hover:border-line-strong hover:text-fg"
          >
            <Link2 className="h-3.5 w-3.5" />
            {copied ? "caption copied" : "copy caption"}
          </button>
          <button
            onClick={download}
            disabled={!ready}
            className="flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/20 disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            download PNG
          </button>
        </div>
      </div>
      <div className="mt-3 overflow-hidden rounded-lg border border-line">
        <canvas ref={canvasRef} width={W} height={H} className="h-auto w-full" />
      </div>
    </div>
  );
}

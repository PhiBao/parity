import { NextResponse } from "next/server";
import { evaluateWatchlist, type TriggerOp } from "@/lib/services/watch";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      items?: { symbol?: unknown; op?: unknown; thresholdPct?: unknown }[];
    };
    const items = Array.isArray(payload.items) ? payload.items.slice(0, 25) : [];
    const clean = items
      .filter(
        (i): i is { symbol: string; op?: unknown; thresholdPct?: unknown } =>
          typeof i.symbol === "string" && i.symbol.length > 0 && i.symbol.length <= 12,
      )
      .map((i) => ({
        symbol: i.symbol.toUpperCase(),
        op: (i.op === "below" ? "below" : "above") as TriggerOp,
        thresholdPct: Number.isFinite(Number(i.thresholdPct)) ? Number(i.thresholdPct) : 1,
      }));

    const evaluations = await evaluateWatchlist(clean);
    return NextResponse.json(
      { evaluations, evaluatedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Evaluation failed" },
      { status: 400 },
    );
  }
}

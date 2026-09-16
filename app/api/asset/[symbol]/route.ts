import { NextResponse } from "next/server";
import { getAsset, getAssetRaw } from "@/lib/services/assets";
import { buildHistory } from "@/lib/verdict/history";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const url = new URL(request.url);
  const includeHistory = url.searchParams.get("history") !== "0";
  const fresh = url.searchParams.get("fresh") === "1";

  try {
    const payload = await getAsset(symbol, { fresh });
    if (!payload) {
      return NextResponse.json({ error: `No RWA asset found for "${symbol}"` }, { status: 404 });
    }

    let history = null;
    if (includeHistory) {
      const asset = await getAssetRaw(symbol);
      if (asset) history = await buildHistory(asset);
    }

    return NextResponse.json(
      { ...payload, history },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Asset unavailable" },
      { status: 502 },
    );
  }
}

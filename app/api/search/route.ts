import { NextResponse } from "next/server";
import { searchAssets } from "@/lib/services/assets";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  if (q.trim().length === 0) return NextResponse.json({ results: [] });
  if (q.length > 40) return NextResponse.json({ error: "Query too long" }, { status: 400 });

  try {
    const results = await searchAssets(q);
    return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search unavailable" },
      { status: 502 },
    );
  }
}

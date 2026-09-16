import { NextResponse } from "next/server";
import { getEvidence } from "@/lib/cmc/client";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9]{8,32}$/.test(id)) {
    return NextResponse.json({ error: "Invalid evidence id" }, { status: 400 });
  }
  const evidence = getEvidence(id);
  if (!evidence) {
    return NextResponse.json(
      { error: "Evidence record expired. Reload the asset to capture a fresh call." },
      { status: 404 },
    );
  }
  return NextResponse.json(evidence, { headers: { "Cache-Control": "no-store" } });
}

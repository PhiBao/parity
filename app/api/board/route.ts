import { NextResponse } from "next/server";
import { getBoard } from "@/lib/services/assets";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await getBoard();
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Board unavailable" },
      { status: 502 },
    );
  }
}

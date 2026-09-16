import { NextResponse } from "next/server";
import { handleMcpBody } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";

/**
 * Parity MCP endpoint — Streamable HTTP, stateless, JSON responses.
 *
 * Point any MCP client at POST /api/mcp:
 *
 *   { "jsonrpc": "2.0", "id": 1, "method": "initialize",
 *     "params": { "protocolVersion": "2025-06-18", "capabilities": {},
 *                 "clientInfo": { "name": "demo", "version": "0.1" } } }
 *
 * then tools/list and tools/call. No auth, no session — the same public,
 * read-only data as the web app, through the same cached services.
 */
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error: body is not JSON." } },
      { status: 400 },
    );
  }

  try {
    const result = await handleMcpBody(payload);
    if (result.status === 202) return new Response(null, { status: 202 });
    return NextResponse.json(result.body, {
      status: result.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Internal MCP error." } },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32600,
        message: "Use POST with a JSON-RPC body. See GET /mcp for setup instructions.",
      },
    },
    { status: 405, headers: { Allow: "POST" } },
  );
}

export async function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

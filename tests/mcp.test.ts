import { describe, expect, it } from "vitest";
import { handleMcpBody } from "@/lib/mcp/server";
import { TOOLS } from "@/lib/mcp/tools";

function rpc(method: string, params: unknown = {}, id: unknown = 1) {
  return { jsonrpc: "2.0", id, method, params };
}

describe("MCP handshake", () => {
  it("negotiates the client's protocol version when supported", async () => {
    const res = await handleMcpBody(
      rpc("initialize", {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "0.1" },
      }),
    );
    expect(res.status).toBe(200);
    const body = res.body as { result: { protocolVersion: string; serverInfo: { name: string } } };
    expect(body.result.protocolVersion).toBe("2025-03-26");
    expect(body.result.serverInfo.name).toBe("parity-mcp");
  });

  it("falls back to the latest protocol for unknown versions", async () => {
    const res = await handleMcpBody(rpc("initialize", { protocolVersion: "1999-01-01" }));
    const body = res.body as { result: { protocolVersion: string } };
    expect(body.result.protocolVersion).toBe("2025-06-18");
  });

  it("answers ping and swallows the initialized notification", async () => {
    const pong = await handleMcpBody(rpc("ping"));
    expect((pong.body as { result: unknown }).result).toEqual({});
    const note = await handleMcpBody({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    expect(note.status).toBe(202);
    expect(note.body).toBeNull();
  });
});

describe("MCP tools/list", () => {
  it("advertises the five Parity tools with schemas", async () => {
    const res = await handleMcpBody(rpc("tools/list"));
    const body = res.body as { result: { tools: { name: string; inputSchema: unknown }[] } };
    const names = body.result.tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "parity_fair_value",
      "parity_history",
      "parity_screener",
      "parity_search",
      "parity_spread",
    ]);
    for (const tool of body.result.tools) {
      expect(tool.inputSchema).toMatchObject({ type: "object" });
    }
    expect(TOOLS).toHaveLength(5);
  });
});

describe("MCP tools/call validation", () => {
  it("rejects unknown tools with Invalid params", async () => {
    const res = await handleMcpBody(rpc("tools/call", { name: "parity_moon_price" }));
    const body = res.body as { error: { code: number; message: string } };
    expect(body.error.code).toBe(-32602);
    expect(body.error.message).toMatch(/Unknown tool/);
  });

  it("rejects a missing tool name", async () => {
    const res = await handleMcpBody(rpc("tools/call", {}));
    expect((res.body as { error: { code: number } }).error.code).toBe(-32602);
  });

  it("returns a tool-level error for an invalid symbol without touching the network", async () => {
    const res = await handleMcpBody(
      rpc("tools/call", { name: "parity_fair_value", arguments: { symbol: "!!!not a ticker!!!" } }),
    );
    const body = res.body as { result: { isError: boolean; content: { text: string }[] } };
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toMatch(/Invalid symbol/);
  });

  it("returns a tool-level error for an empty search query", async () => {
    const res = await handleMcpBody(rpc("tools/call", { name: "parity_search", arguments: {} }));
    const body = res.body as { result: { isError: boolean } };
    expect(body.result.isError).toBe(true);
  });
});

describe("MCP error handling", () => {
  it("reports method-not-found for unknown methods", async () => {
    const res = await handleMcpBody(rpc("resources/list"));
    expect((res.body as { error: { code: number } }).error.code).toBe(-32601);
  });

  it("stays silent on id-less garbage (notifications get no reply)", async () => {
    const res = await handleMcpBody({ hello: "world" });
    expect(res.status).toBe(202);
    expect(res.body).toBeNull();
  });

  it("reports invalid request for garbage that carries an id", async () => {
    const res = await handleMcpBody({ hello: "world", id: 7 });
    expect((res.body as { error: { code: number } }).error.code).toBe(-32600);
  });

  it("supports batches and drops notifications from the response", async () => {
    const res = await handleMcpBody([
      rpc("ping", {}, 1),
      { jsonrpc: "2.0", method: "notifications/initialized" },
      rpc("tools/list", {}, 2),
    ]);
    const body = res.body as { id: unknown }[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.map((r) => r.id).sort()).toEqual([1, 2]);
  });

  it("returns 202 when a batch holds only notifications", async () => {
    const res = await handleMcpBody([{ jsonrpc: "2.0", method: "notifications/initialized" }]);
    expect(res.status).toBe(202);
    expect(res.body).toBeNull();
  });
});

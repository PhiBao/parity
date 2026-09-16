import { TOOLS, TOOL_MAP, ToolError } from "./tools";

/**
 * Minimal, stateless MCP server (Streamable HTTP, JSON responses only).
 *
 * Speaks exactly the lifecycle an agent client needs — initialize, ping,
 * tools/list, tools/call — with no sessions, no SSE and no sampling. Every
 * tool reuses the same cached services as the web app, so an agent sees the
 * same numbers a human sees, including dividend-accrual adjustment.
 */

export const SERVER_NAME = "parity-mcp";
export const SERVER_VERSION = "1.0.0";
const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const LATEST_PROTOCOL = SUPPORTED_PROTOCOLS[0];

interface JsonRpcRequest {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function err(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function ok(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function handleOne(message: unknown): Promise<JsonRpcResponse | null> {
  if (typeof message !== "object" || message === null || Array.isArray(message)) {
    return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } };
  }
  const req = message as JsonRpcRequest;
  const hasId = req.id !== undefined;
  const id = typeof req.id === "string" || typeof req.id === "number" ? req.id : null;

  if (req.jsonrpc !== "2.0" || typeof req.method !== "string") {
    if (!hasId) return null;
    return err(id, -32600, "Invalid Request: expected JSON-RPC 2.0 with a method name.");
  }

  const params = asRecord(req.params);

  switch (req.method) {
    case "initialize": {
      const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const negotiated = SUPPORTED_PROTOCOLS.includes(requested) ? requested : LATEST_PROTOCOL;
      return ok(id, {
        protocolVersion: negotiated,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      });
    }

    case "notifications/initialized":
      return null;

    case "ping":
      return ok(id, {});

    case "tools/list":
      return ok(id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });

    case "tools/call": {
      const name = params.name;
      if (typeof name !== "string") {
        return err(id, -32602, 'Invalid params: "name" must be a tool name string.');
      }
      const tool = TOOL_MAP.get(name);
      if (!tool) {
        return err(id, -32602, `Unknown tool "${name}". Call tools/list to discover available tools.`);
      }
      const args = asRecord(params.arguments);
      try {
        const out = await tool.handler(args);
        return ok(id, {
          content: [{ type: "text", text: out.summary }],
          structuredContent: out.data,
          ...(out.isError ? { isError: true } : {}),
        });
      } catch (error) {
        const message = error instanceof ToolError ? error.message : "Tool execution failed unexpectedly.";
        return ok(id, {
          content: [{ type: "text", text: message }],
          isError: true,
        });
      }
    }

    default:
      if (!hasId) return null;
      return err(id, -32601, `Method not found: ${req.method}.`);
  }
}

export interface McpHttpResult {
  status: number;
  body: unknown;
}

/**
 * Entry point for the HTTP route. Returns a JSON-RPC response (or batch of
 * them), or a 202 with no body when the payload held only notifications.
 */
export async function handleMcpBody(payload: unknown): Promise<McpHttpResult> {
  if (Array.isArray(payload)) {
    if (payload.length === 0) {
      return { status: 200, body: err(null, -32600, "Invalid Request: empty batch.") };
    }
    const responses = (await Promise.all(payload.map(handleOne))).filter(
      (r): r is JsonRpcResponse => r !== null,
    );
    if (responses.length === 0) return { status: 202, body: null };
    return { status: 200, body: responses };
  }
  const single = await handleOne(payload);
  if (single === null) return { status: 202, body: null };
  return { status: 200, body: single };
}

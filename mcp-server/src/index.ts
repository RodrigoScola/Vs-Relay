#!/usr/bin/env node
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { DEFAULT_MCP_HTTP_PORT, DEFAULT_PORT } from "@claude-vscode/shared";
import { BridgeClient } from "./wsClient.js";
import { registerTools } from "./tools.js";
import { SERVER_INSTRUCTIONS } from "./instructions.js";

function resolvePort(envVar: string, fallback: number): number {
  const fromEnv = process.env[envVar];
  if (fromEnv !== undefined) {
    const parsed = Number.parseInt(fromEnv, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw.length > 0 ? JSON.parse(raw) : undefined;
}

function sendJsonRpcError(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { "Content-Type": "application/json" }).end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message },
      id: null,
    }),
  );
}

async function main(): Promise<void> {
  const bridgePort = resolvePort("CLAUDE_BRIDGE_PORT", DEFAULT_PORT);
  const httpPort = resolvePort("CLAUDE_MCP_HTTP_PORT", DEFAULT_MCP_HTTP_PORT);
  const client = new BridgeClient(`ws://127.0.0.1:${String(bridgePort)}`);

  const transports = new Map<string, StreamableHTTPServerTransport>();

  function createSession(): StreamableHTTPServerTransport {
    const server = new McpServer(
      { name: "claude-vscode-bridge", version: "0.1.0" },
      { instructions: SERVER_INSTRUCTIONS },
    );
    registerTools(server, client);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        transports.set(sessionId, transport);
      },
    });
    transport.onclose = () => {
      if (transport.sessionId !== undefined) {
        transports.delete(transport.sessionId);
      }
    };

    // StreamableHTTPServerTransport's onclose/onerror accessors don't satisfy the SDK's own
    // Transport interface under exactOptionalPropertyTypes.
    // @ts-expect-error -- SDK type mismatch, not a real incompatibility
    void server.connect(transport);

    return transport;
  }

  const httpServer = createServer((req, res) => {
    if (req.url !== "/mcp") {
      res.writeHead(404).end();
      return;
    }

    void (async () => {
      const sessionId = req.headers["mcp-session-id"];
      const existing = typeof sessionId === "string" ? transports.get(sessionId) : undefined;

      if (existing) {
        await existing.handleRequest(req, res);
        return;
      }

      if (req.method !== "POST") {
        sendJsonRpcError(res, 400, "No valid session ID provided.");
        return;
      }

      const body = await readJsonBody(req);
      if (!isInitializeRequest(body)) {
        sendJsonRpcError(res, 400, "No valid session ID provided.");
        return;
      }

      const transport = createSession();
      await transport.handleRequest(req, res, body);
    })().catch((error: unknown) => {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        sendJsonRpcError(res, 500, "Internal server error");
      }
    });
  });

  httpServer.listen(httpPort, "127.0.0.1", () => {
    console.error(`Claude VSCode Bridge MCP server listening on http://127.0.0.1:${String(httpPort)}/mcp`);
  });
}

main().catch((error: unknown) => {
  console.error("Fatal error starting Claude VSCode Bridge MCP server:", error);
  process.exit(1);
});

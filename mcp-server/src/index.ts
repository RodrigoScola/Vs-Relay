#!/usr/bin/env node
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
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

async function main(): Promise<void> {
  const bridgePort = resolvePort("CLAUDE_BRIDGE_PORT", DEFAULT_PORT);
  const httpPort = resolvePort("CLAUDE_MCP_HTTP_PORT", DEFAULT_MCP_HTTP_PORT);
  const client = new BridgeClient(`ws://127.0.0.1:${String(bridgePort)}`);

  const server = new McpServer(
    {
      name: "claude-vscode-bridge",
      version: "0.1.0",
    },
    {
      instructions: SERVER_INSTRUCTIONS,
    },
  );

  registerTools(server, client);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });
  // StreamableHTTPServerTransport's onclose/onerror accessors don't satisfy the SDK's own
  // Transport interface under exactOptionalPropertyTypes.
  // @ts-expect-error -- SDK type mismatch, not a real incompatibility
  await server.connect(transport);

  const httpServer = createServer((req, res) => {
    if (req.url !== "/mcp") {
      res.writeHead(404).end();
      return;
    }
    void transport.handleRequest(req, res);
  });

  httpServer.listen(httpPort, "127.0.0.1", () => {
    console.error(`Claude VSCode Bridge MCP server listening on http://127.0.0.1:${String(httpPort)}/mcp`);
  });
}

main().catch((error: unknown) => {
  console.error("Fatal error starting Claude VSCode Bridge MCP server:", error);
  process.exit(1);
});

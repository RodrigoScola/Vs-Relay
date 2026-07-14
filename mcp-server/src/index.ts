#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DEFAULT_PORT } from "@claude-vscode/shared";
import { BridgeClient } from "./wsClient.js";
import { registerTools } from "./tools.js";
import { SERVER_INSTRUCTIONS } from "./instructions.js";

function resolvePort(): number {
  const fromEnv = process.env["CLAUDE_BRIDGE_PORT"];
  if (fromEnv !== undefined) {
    const parsed = Number.parseInt(fromEnv, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return DEFAULT_PORT;
}

async function main(): Promise<void> {
  const port = resolvePort();
  const client = new BridgeClient(`ws://127.0.0.1:${String(port)}`);

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

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error("Fatal error starting Claude VSCode Bridge MCP server:", error);
  process.exit(1);
});

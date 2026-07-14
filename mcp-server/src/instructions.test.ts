import { describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { SERVER_INSTRUCTIONS } from "./instructions.js";

describe("server instructions", () => {
  it("are sent to every client during the initialize handshake", async () => {
    const server = new McpServer({ name: "test", version: "0.0.0" }, { instructions: SERVER_INSTRUCTIONS });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" });

    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    expect(client.getInstructions()).toBe(SERVER_INSTRUCTIONS);
  });

  it("cover the key operational guidance", () => {
    expect(SERVER_INSTRUCTIONS).toContain("testing.runAll");
    expect(SERVER_INSTRUCTIONS).toContain("vscode_list_commands");
    expect(SERVER_INSTRUCTIONS).toContain("do not sleep");
  });
});

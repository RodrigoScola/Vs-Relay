import { beforeEach, describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type {
  MethodName,
  MethodParams,
  MethodResult,
} from "@agents-vscode/shared";
import { registerTools } from "./tools.js";
import type { BridgeClient } from "./wsClient.js";

class FakeBridgeClient {
  public readonly calls: { method: MethodName; params: unknown }[] = [];

  constructor(
    private readonly responses: Partial<Record<MethodName, unknown>>,
  ) {}

  call<M extends MethodName>(
    method: M,
    params: MethodParams<M>,
  ): Promise<MethodResult<M>> {
    this.calls.push({ method, params });
    return Promise.resolve(this.responses[method] as MethodResult<M>);
  }
}

async function connectedClient(fake: FakeBridgeClient): Promise<Client> {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerTools(server, fake as unknown as BridgeClient);

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);
  return client;
}

describe("registerTools", () => {
  let fake: FakeBridgeClient;
  let client: Client;

  beforeEach(async () => {
    fake = new FakeBridgeClient({
      "editor/getOpenFiles": {
        files: [
          {
            path: "/a.ts",
            languageId: "typescript",
            isDirty: false,
            isActive: true,
          },
        ],
      },
      "file/create": { created: true },
    });
    client = await connectedClient(fake);
  });

  it("exposes every bridge method as a tool", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toContain("vscode_get_open_files");
    expect(names).toContain("vscode_create_file");
    expect(names).toContain("vscode_execute_command");
    expect(names.length).toBeGreaterThanOrEqual(21);
  });

  it("forwards a no-arg tool call to the bridge client and returns its result", async () => {
    const result = await client.callTool({
      name: "vscode_get_open_files",
      arguments: {},
    });
    expect(fake.calls).toEqual([
      { method: "editor/getOpenFiles", params: undefined },
    ]);
    const content = result.content;
    expect(Array.isArray(content)).toBe(true);
  });

  it("validates required arguments via the tool's zod schema", async () => {
    const result = await client.callTool({
      name: "vscode_create_file",
      arguments: {},
    });
    expect(result.isError).toBe(true);
    expect(fake.calls).toEqual([]);
  });

  it("passes optional args through to the bridge call", async () => {
    await client.callTool({
      name: "vscode_create_file",
      arguments: { path: "/new.ts", content: "hi" },
    });
    expect(fake.calls).toEqual([
      {
        method: "file/create",
        params: { path: "/new.ts", content: "hi", overwrite: undefined },
      },
    ]);
  });
});

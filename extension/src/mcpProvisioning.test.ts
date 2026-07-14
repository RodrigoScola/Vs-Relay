import { beforeEach, describe, expect, it } from "vitest";
import * as vscode from "vscode";
import { __mockControls } from "./test/vscodeMock";
import { ensureMcpConfigured } from "./mcpProvisioning";

function fakeContext(bundledPath: string): vscode.ExtensionContext {
  return { asAbsolutePath: (relative: string) => `${bundledPath}/${relative}` } as unknown as vscode.ExtensionContext;
}

function fakeOutput(): vscode.OutputChannel {
  return { appendLine: () => undefined, show: () => undefined } as unknown as vscode.OutputChannel;
}

describe("ensureMcpConfigured", () => {
  const folderUri = vscode.Uri.file("/workspace");
  const mcpJsonUri = vscode.Uri.joinPath(folderUri, ".mcp.json");
  const vscodeMcpJsonUri = vscode.Uri.joinPath(folderUri, ".vscode", "mcp.json");

  beforeEach(() => {
    __mockControls.reset();
    __mockControls.setWorkspaceFolders([{ uri: folderUri, name: "workspace", index: 0 }]);
  });

  it("does nothing when there are no workspace folders", async () => {
    __mockControls.setWorkspaceFolders([]);
    await ensureMcpConfigured(fakeContext("/ext"), 4823, fakeOutput());
    expect(__mockControls.getFile(mcpJsonUri)).toBeUndefined();
  });

  it("does nothing when claudeBridge.autoConfigureMcp is disabled", async () => {
    __mockControls.setConfig({ autoConfigureMcp: false });
    await ensureMcpConfigured(fakeContext("/ext"), 4823, fakeOutput());
    expect(__mockControls.getFile(mcpJsonUri)).toBeUndefined();
  });

  it("creates .mcp.json and .vscode/mcp.json with a vscode-bridge entry when missing", async () => {
    await ensureMcpConfigured(fakeContext("/ext"), 4823, fakeOutput());

    const mcpJson = JSON.parse(__mockControls.getFile(mcpJsonUri) ?? "{}") as {
      mcpServers: { "vscode-bridge": { command: string; args: string[]; env: { CLAUDE_BRIDGE_PORT: string } } };
    };
    expect(mcpJson.mcpServers["vscode-bridge"].command).toBe("node");
    expect(mcpJson.mcpServers["vscode-bridge"].args).toEqual(["/ext/bundled/mcp-server.cjs"]);
    expect(mcpJson.mcpServers["vscode-bridge"].env.CLAUDE_BRIDGE_PORT).toBe("4823");

    const vscodeMcpJson = JSON.parse(__mockControls.getFile(vscodeMcpJsonUri) ?? "{}") as {
      servers: { "vscode-bridge": { command: string } };
    };
    expect(vscodeMcpJson.servers["vscode-bridge"].command).toBe("node");
  });

  it("does not overwrite an existing vscode-bridge entry", async () => {
    __mockControls.setFile(
      mcpJsonUri,
      JSON.stringify({ mcpServers: { "vscode-bridge": { command: "custom", args: [], env: {} } } }),
    );

    await ensureMcpConfigured(fakeContext("/ext"), 4823, fakeOutput());

    const mcpJson = JSON.parse(__mockControls.getFile(mcpJsonUri) ?? "{}") as {
      mcpServers: { "vscode-bridge": { command: string } };
    };
    expect(mcpJson.mcpServers["vscode-bridge"].command).toBe("custom");
  });

  it("preserves other entries already in the file", async () => {
    __mockControls.setFile(mcpJsonUri, JSON.stringify({ mcpServers: { other: { command: "other-cmd" } } }));

    await ensureMcpConfigured(fakeContext("/ext"), 4823, fakeOutput());

    const mcpJson = JSON.parse(__mockControls.getFile(mcpJsonUri) ?? "{}") as {
      mcpServers: { other: { command: string }; "vscode-bridge": { command: string } };
    };
    expect(mcpJson.mcpServers.other.command).toBe("other-cmd");
    expect(mcpJson.mcpServers["vscode-bridge"].command).toBe("node");
  });

  it("does not touch a file that fails to parse as JSON", async () => {
    __mockControls.setFile(mcpJsonUri, "{ not valid json");

    await ensureMcpConfigured(fakeContext("/ext"), 4823, fakeOutput());

    expect(__mockControls.getFile(mcpJsonUri)).toBe("{ not valid json");
  });
});

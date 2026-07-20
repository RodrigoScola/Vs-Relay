import { beforeEach, describe, expect, it } from "vitest";
import * as vscode from "vscode";
import { __mockControls } from "./test/vscodeMock";
import { ensureMcpConfigured } from "./mcpProvisioning";

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
    await ensureMcpConfigured(4824, fakeOutput());
    expect(__mockControls.getFile(mcpJsonUri)).toBeUndefined();
  });

  it("does nothing when vsRelay.autoConfigureMcp is disabled", async () => {
    __mockControls.setConfig({ autoConfigureMcp: false });
    await ensureMcpConfigured(4824, fakeOutput());
    expect(__mockControls.getFile(mcpJsonUri)).toBeUndefined();
  });

  it("creates .mcp.json and .vscode/mcp.json with a vs-relay entry when missing", async () => {
    await ensureMcpConfigured(4824, fakeOutput());

    const mcpJson = JSON.parse(__mockControls.getFile(mcpJsonUri) ?? "{}") as {
      mcpServers: { "vs-relay": { type: string; url: string } };
    };
    expect(mcpJson.mcpServers["vs-relay"].type).toBe("http");
    expect(mcpJson.mcpServers["vs-relay"].url).toBe("http://127.0.0.1:4824/mcp");

    const vscodeMcpJson = JSON.parse(__mockControls.getFile(vscodeMcpJsonUri) ?? "{}") as {
      servers: { "vs-relay": { type: string; url: string } };
    };
    expect(vscodeMcpJson.servers["vs-relay"].type).toBe("http");
    expect(vscodeMcpJson.servers["vs-relay"].url).toBe("http://127.0.0.1:4824/mcp");
  });

  it("does not overwrite an existing vs-relay entry", async () => {
    __mockControls.setFile(
      mcpJsonUri,
      JSON.stringify({ mcpServers: { "vs-relay": { type: "http", url: "http://custom/mcp" } } }),
    );

    await ensureMcpConfigured(4824, fakeOutput());

    const mcpJson = JSON.parse(__mockControls.getFile(mcpJsonUri) ?? "{}") as {
      mcpServers: { "vs-relay": { url: string } };
    };
    expect(mcpJson.mcpServers["vs-relay"].url).toBe("http://custom/mcp");
  });

  it("preserves other entries already in the file", async () => {
    __mockControls.setFile(mcpJsonUri, JSON.stringify({ mcpServers: { other: { command: "other-cmd" } } }));

    await ensureMcpConfigured(4824, fakeOutput());

    const mcpJson = JSON.parse(__mockControls.getFile(mcpJsonUri) ?? "{}") as {
      mcpServers: { other: { command: string }; "vs-relay": { url: string } };
    };
    expect(mcpJson.mcpServers.other.command).toBe("other-cmd");
    expect(mcpJson.mcpServers["vs-relay"].url).toBe("http://127.0.0.1:4824/mcp");
  });

  it("does not touch a file that fails to parse as JSON", async () => {
    __mockControls.setFile(mcpJsonUri, "{ not valid json");

    await ensureMcpConfigured(4824, fakeOutput());

    expect(__mockControls.getFile(mcpJsonUri)).toBe("{ not valid json");
  });
});

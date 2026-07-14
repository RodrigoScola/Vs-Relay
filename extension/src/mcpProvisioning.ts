import * as vscode from "vscode";

const SERVER_KEY = "vscode-bridge";

type ReadOutcome =
  | { kind: "missing" }
  | { kind: "parsed"; data: Record<string, unknown> }
  | { kind: "unreadable" };

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

async function readJsonFile(uri: vscode.Uri): Promise<ReadOutcome> {
  let bytes: Uint8Array;
  try {
    bytes = await vscode.workspace.fs.readFile(uri);
  } catch {
    return { kind: "missing" };
  }

  try {
    const parsed: unknown = JSON.parse(Buffer.from(bytes).toString("utf8"));
    const data = asRecord(parsed);
    return data ? { kind: "parsed", data } : { kind: "unreadable" };
  } catch {
    return { kind: "unreadable" };
  }
}

type EntryOutcome = "created" | "already-present" | "unreadable";

async function ensureMcpEntry(
  dirUri: vscode.Uri,
  fileName: string,
  containerKey: "mcpServers" | "servers",
  bundledServerPath: string,
  port: number,
): Promise<EntryOutcome> {
  const fileUri = vscode.Uri.joinPath(dirUri, fileName);
  const outcome = await readJsonFile(fileUri);
  if (outcome.kind === "unreadable") {
    return "unreadable";
  }

  const data = outcome.kind === "parsed" ? outcome.data : {};
  const container = asRecord(data[containerKey]) ?? {};
  if (SERVER_KEY in container) {
    return "already-present";
  }

  const nextData: Record<string, unknown> = {
    ...data,
    [containerKey]: {
      ...container,
      [SERVER_KEY]: {
        type: "stdio",
        command: "node",
        args: [bundledServerPath],
        env: { CLAUDE_BRIDGE_PORT: String(port) },
      },
    },
  };

  await vscode.workspace.fs.createDirectory(dirUri);
  await vscode.workspace.fs.writeFile(fileUri, Buffer.from(`${JSON.stringify(nextData, null, 2)}\n`, "utf8"));
  return "created";
}

export async function ensureMcpConfigured(
  context: vscode.ExtensionContext,
  port: number,
  output: vscode.OutputChannel,
): Promise<void> {
  const autoConfigure = vscode.workspace.getConfiguration("claudeBridge").get<boolean>("autoConfigureMcp");
  if (autoConfigure === false) {
    return;
  }

  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) {
    return;
  }

  const bundledServerPath = context.asAbsolutePath("bundled/mcp-server.cjs");
  const created: string[] = [];

  for (const folder of folders) {
    const claudeCodeResult = await ensureMcpEntry(folder.uri, ".mcp.json", "mcpServers", bundledServerPath, port);
    if (claudeCodeResult === "created") {
      created.push(vscode.Uri.joinPath(folder.uri, ".mcp.json").fsPath);
    }

    const vscodeResult = await ensureMcpEntry(
      vscode.Uri.joinPath(folder.uri, ".vscode"),
      "mcp.json",
      "servers",
      bundledServerPath,
      port,
    );
    if (vscodeResult === "created") {
      created.push(vscode.Uri.joinPath(folder.uri, ".vscode", "mcp.json").fsPath);
    }
  }

  if (created.length === 0) {
    return;
  }

  output.appendLine(`Configured MCP server entries in:\n${created.join("\n")}`);
  const selection = await vscode.window.showInformationMessage(
    `Claude VSCode Bridge: added MCP server config to ${String(created.length)} file(s). ` +
      "Restart your MCP client (e.g. Claude Code) to connect.",
    "Show Output",
  );
  if (selection === "Show Output") {
    output.show();
  }
}

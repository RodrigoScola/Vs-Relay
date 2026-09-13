import * as vscode from "vscode";
import { DEFAULT_MCP_HTTP_PORT, DEFAULT_PORT } from "@agents-vscode/shared";
import { BridgeServer } from "./bridgeServer";
import { createHandlers } from "./handlers";
import { ensureMcpConfigured } from "./mcpProvisioning";
import { McpServerProcess } from "./mcpServerProcess";
import { BridgeState } from "./state";

let bridgeServer: BridgeServer | undefined;
let bridgeState: BridgeState | undefined;
let mcpServerProcess: McpServerProcess | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;
let outputChannel: vscode.OutputChannel | undefined;

function getPort(): number {
  const configured = vscode.workspace
    .getConfiguration("vsRelay")
    .get<number>("port");
  return configured ?? DEFAULT_PORT;
}

function getMcpHttpPort(): number {
  const configured = vscode.workspace
    .getConfiguration("vsRelay")
    .get<number>("mcpHttpPort");
  return configured ?? DEFAULT_MCP_HTTP_PORT;
}

function startServer(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
): void {
  bridgeState?.dispose();
  bridgeServer?.dispose();
  mcpServerProcess?.dispose();

  const state = new BridgeState();
  const handlers = createHandlers(state);
  const server = new BridgeServer(getPort(), handlers, output);
  server.start();

  const bundledServerPath = context.asAbsolutePath("bundled/mcp-server.cjs");
  const mcpProcess = new McpServerProcess(
    bundledServerPath,
    getPort(),
    getMcpHttpPort(),
    output,
  );
  mcpProcess.start();

  bridgeState = state;
  bridgeServer = server;
  mcpServerProcess = mcpProcess;
  context.subscriptions.push(state, server, mcpProcess);

  if (statusBarItem) {
    statusBarItem.text = `$(plug) VS Relay :${String(getPort())}`;
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("VS Relay");
  outputChannel = output;
  context.subscriptions.push(output);

  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.command = "vsRelay.showStatus";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  startServer(context, output);

  context.subscriptions.push(
    vscode.commands.registerCommand("vsRelay.configureMcp", () => {
      void ensureMcpConfigured(getMcpHttpPort(), output).catch(
        (error: unknown) => {
          output.appendLine(
            `Failed to configure MCP server entries: ${String(error)}`,
          );
        },
      );
    }),
    vscode.commands.registerCommand("vsRelay.restart", () => {
      startServer(context, output);
      void vscode.window.showInformationMessage(
        `VS Relay restarted on port ${String(getPort())}.`,
      );
    }),
    vscode.commands.registerCommand("vsRelay.showStatus", () => {
      output.show();
      const clientCount = bridgeServer?.clientCount ?? 0;
      void vscode.window.showInformationMessage(
        `VS Relay listening on port ${String(getPort())}. Connected clients: ${String(clientCount)}.`,
      );
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration("vsRelay.port") ||
        event.affectsConfiguration("vsRelay.mcpHttpPort")
      ) {
        startServer(context, output);
      }
    }),
  );
}

export function deactivate(): void {
  bridgeServer?.dispose();
  bridgeState?.dispose();
  mcpServerProcess?.dispose();
  outputChannel?.dispose();
}

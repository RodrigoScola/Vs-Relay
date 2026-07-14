import * as vscode from "vscode";
import { DEFAULT_PORT } from "@claude-vscode/shared";
import { BridgeServer } from "./bridgeServer";
import { createHandlers } from "./handlers";
import { ensureMcpConfigured } from "./mcpProvisioning";
import { BridgeState } from "./state";

let bridgeServer: BridgeServer | undefined;
let bridgeState: BridgeState | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;
let outputChannel: vscode.OutputChannel | undefined;

function getPort(): number {
  const configured = vscode.workspace.getConfiguration("claudeBridge").get<number>("port");
  return configured ?? DEFAULT_PORT;
}

function startServer(context: vscode.ExtensionContext, output: vscode.OutputChannel): void {
  bridgeState?.dispose();
  bridgeServer?.dispose();

  const state = new BridgeState();
  const handlers = createHandlers(state);
  const server = new BridgeServer(getPort(), handlers, output);
  server.start();

  bridgeState = state;
  bridgeServer = server;
  context.subscriptions.push(state, server);

  if (statusBarItem) {
    statusBarItem.text = `$(plug) Claude Bridge :${String(getPort())}`;
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Claude VSCode Bridge");
  outputChannel = output;
  context.subscriptions.push(output);

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = "claudeBridge.showStatus";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  startServer(context, output);

  void ensureMcpConfigured(context, getPort(), output).catch((error: unknown) => {
    output.appendLine(`Failed to auto-configure MCP server entries: ${String(error)}`);
  });

  context.subscriptions.push(
    vscode.commands.registerCommand("claudeBridge.restart", () => {
      startServer(context, output);
      void vscode.window.showInformationMessage(`Claude Bridge restarted on port ${String(getPort())}.`);
    }),
    vscode.commands.registerCommand("claudeBridge.showStatus", () => {
      output.show();
      const clientCount = bridgeServer?.clientCount ?? 0;
      void vscode.window.showInformationMessage(
        `Claude Bridge listening on port ${String(getPort())}. Connected clients: ${String(clientCount)}.`,
      );
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("claudeBridge.port")) {
        startServer(context, output);
      }
    }),
  );
}

export function deactivate(): void {
  bridgeServer?.dispose();
  bridgeState?.dispose();
  outputChannel?.dispose();
}

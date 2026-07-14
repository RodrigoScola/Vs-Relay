import * as vscode from "vscode";

export class BridgeState implements vscode.Disposable {
  private readonly debugSessions = new Map<string, vscode.DebugSession>();
  private readonly terminalOutput = new Map<string, string>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    this.disposables.push(
      vscode.debug.onDidStartDebugSession((session) => {
        this.debugSessions.set(session.id, session);
      }),
      vscode.debug.onDidTerminateDebugSession((session) => {
        this.debugSessions.delete(session.id);
      }),
      vscode.window.onDidCloseTerminal((terminal) => {
        this.terminalOutput.delete(terminal.name);
      }),
    );
  }

  listDebugSessions(): vscode.DebugSession[] {
    return Array.from(this.debugSessions.values());
  }

  findDebugSession(sessionId: string): vscode.DebugSession | undefined {
    return this.debugSessions.get(sessionId);
  }

  appendTerminalOutput(terminalName: string, chunk: string): void {
    const existing = this.terminalOutput.get(terminalName) ?? "";
    this.terminalOutput.set(terminalName, existing + chunk);
  }

  getTerminalOutput(terminalName: string): string | undefined {
    return this.terminalOutput.get(terminalName);
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}

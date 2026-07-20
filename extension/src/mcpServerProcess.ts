import { spawn, type ChildProcess } from "node:child_process";
import type * as vscode from "vscode";

export class McpServerProcess implements vscode.Disposable {
  private child: ChildProcess | undefined;

  constructor(
    private readonly bundledServerPath: string,
    private readonly bridgePort: number,
    private readonly mcpHttpPort: number,
    private readonly output: vscode.OutputChannel,
  ) {}

  start(): void {
    const child = spawn(process.execPath, [this.bundledServerPath], {
      env: {
        ...process.env,
        VS_RELAY_PORT: String(this.bridgePort),
        VS_RELAY_MCP_HTTP_PORT: String(this.mcpHttpPort),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk: Buffer) => {
      this.output.append(chunk.toString("utf8"));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      this.output.append(chunk.toString("utf8"));
    });
    child.on("exit", (code, signal) => {
      this.output.appendLine(`MCP server process exited (code=${String(code)}, signal=${String(signal)}).`);
    });
    child.on("error", (error) => {
      this.output.appendLine(`Failed to start MCP server process: ${String(error)}`);
    });

    this.child = child;
  }

  dispose(): void {
    this.child?.kill();
    this.child = undefined;
  }
}

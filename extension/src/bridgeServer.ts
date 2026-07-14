import * as vscode from "vscode";
import type { RawData, WebSocket } from "ws";
import { WebSocketServer } from "ws";
import type { HelloMessage, MethodName, RpcRequest, RpcResponse } from "@claude-vscode/shared";
import { PROTOCOL_VERSION } from "@claude-vscode/shared";
import type { Handlers } from "./handlers";

function rawDataToString(data: RawData): string {
  if (Buffer.isBuffer(data)) {
    return data.toString("utf8");
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8");
  }
  return Buffer.from(data).toString("utf8");
}

function isRpcRequest(value: unknown): value is RpcRequest {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record["id"] === "string" && typeof record["method"] === "string";
}

export class BridgeServer implements vscode.Disposable {
  private server: WebSocketServer | undefined;
  private readonly clients = new Set<WebSocket>();

  constructor(
    private readonly port: number,
    private readonly handlers: Handlers,
    private readonly output: vscode.OutputChannel,
  ) {}

  start(): void {
    this.server = new WebSocketServer({ port: this.port, host: "127.0.0.1" });

    this.server.on("connection", (socket) => {
      this.clients.add(socket);
      this.output.appendLine("Client connected.");

      const hello: HelloMessage = {
        type: "hello",
        protocolVersion: PROTOCOL_VERSION,
        workspaceFolders: (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),
      };
      const workspaceName = vscode.workspace.name;
      if (workspaceName !== undefined) {
        hello.workspaceName = workspaceName;
      }
      socket.send(JSON.stringify(hello));

      socket.on("message", (data) => {
        void this.handleMessage(socket, rawDataToString(data));
      });

      socket.on("close", () => {
        this.clients.delete(socket);
        this.output.appendLine("Client disconnected.");
      });

      socket.on("error", (error) => {
        this.output.appendLine(`Socket error: ${String(error)}`);
      });
    });

    this.server.on("error", (error) => {
      this.output.appendLine(`Server error: ${String(error)}`);
    });

    this.output.appendLine(`Bridge server listening on ws://127.0.0.1:${String(this.port)}`);
  }

  private async handleMessage(socket: WebSocket, raw: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.output.appendLine("Received malformed JSON message.");
      return;
    }

    if (!isRpcRequest(parsed)) {
      this.output.appendLine("Received a message that is not a valid RPC request.");
      return;
    }

    const response = await this.dispatch(parsed);
    socket.send(JSON.stringify(response));
  }

  private async dispatch(request: RpcRequest): Promise<RpcResponse> {
    const method = request.method as MethodName;
    const handler = this.handlers[method] as ((params: unknown) => Promise<unknown>) | undefined;

    if (!handler) {
      return { id: request.id, error: { message: `Unknown method: ${request.method}` } };
    }

    try {
      const result = await handler(request.params);
      return { id: request.id, result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.output.appendLine(`Error handling ${request.method}: ${message}`);
      return { id: request.id, error: { message } };
    }
  }

  get clientCount(): number {
    return this.clients.size;
  }

  dispose(): void {
    for (const client of this.clients) {
      client.close();
    }
    this.server?.close();
  }
}

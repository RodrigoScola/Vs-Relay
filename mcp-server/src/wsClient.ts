import { WebSocket } from "ws";
import type { RawData } from "ws";
import type { HelloMessage, MethodName, MethodParams, MethodResult, RpcRequest, RpcResponse } from "@claude-vscode/shared";

const REQUEST_TIMEOUT_MS = 15_000;
const CONNECT_TIMEOUT_MS = 5_000;

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

function rawDataToString(data: RawData): string {
  if (Buffer.isBuffer(data)) {
    return data.toString("utf8");
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8");
  }
  return Buffer.from(data).toString("utf8");
}

function isRpcResponse(value: unknown): value is RpcResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return typeof (value as Record<string, unknown>)["id"] === "string";
}

function isHelloMessage(value: unknown): value is HelloMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return (value as Record<string, unknown>)["type"] === "hello";
}

export class BridgeClient {
  private socket: WebSocket | undefined;
  private connectPromise: Promise<void> | undefined;
  private hello: HelloMessage | undefined;
  private nextId = 0;
  private readonly pending = new Map<string, PendingRequest>();

  constructor(private readonly url: string) {}

  async getHello(): Promise<HelloMessage> {
    await this.ensureConnected();
    if (!this.hello) {
      throw new Error("Connected to the bridge but did not receive a hello message.");
    }
    return this.hello;
  }

  async call<M extends MethodName>(method: M, params: MethodParams<M>): Promise<MethodResult<M>> {
    await this.ensureConnected();
    const socket = this.socket;
    if (!socket) {
      throw new Error("Not connected to the VSCode bridge.");
    }

    const id = String(this.nextId++);
    const request: RpcRequest = { id, method, params };

    const resultPromise = new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request "${method}" timed out after ${String(REQUEST_TIMEOUT_MS)}ms.`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timeout });
    });

    socket.send(JSON.stringify(request));
    return (await resultPromise) as MethodResult<M>;
  }

  private ensureConnected(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.url);
      const connectTimeout = setTimeout(() => {
        socket.terminate();
        reject(
          new Error(
            `Could not connect to the VS Relay extension at ${this.url}. ` +
              "Make sure VSCode is open with the VS Relay extension installed and active.",
          ),
        );
      }, CONNECT_TIMEOUT_MS);

      socket.on("open", () => {
        this.socket = socket;
      });

      socket.on("message", (data) => {
        this.handleMessage(rawDataToString(data), () => {
          clearTimeout(connectTimeout);
          resolve();
        });
      });

      socket.on("close", () => {
        this.socket = undefined;
        this.connectPromise = undefined;
        for (const [id, request] of this.pending) {
          clearTimeout(request.timeout);
          request.reject(new Error("Connection to the VSCode bridge closed."));
          this.pending.delete(id);
        }
      });

      socket.on("error", (error) => {
        clearTimeout(connectTimeout);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });

    return this.connectPromise;
  }

  private handleMessage(raw: string, onHello: () => void): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    if (isHelloMessage(parsed)) {
      this.hello = parsed;
      onHello();
      return;
    }

    if (!isRpcResponse(parsed)) {
      return;
    }

    const pending = this.pending.get(parsed.id);
    if (!pending) {
      return;
    }
    this.pending.delete(parsed.id);
    clearTimeout(pending.timeout);

    if (parsed.error) {
      pending.reject(new Error(parsed.error.message));
    } else {
      pending.resolve(parsed.result);
    }
  }
}

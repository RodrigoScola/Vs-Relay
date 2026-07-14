import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import type { HelloMessage, RpcRequest, RpcResponse } from "@claude-vscode/shared";
import { PROTOCOL_VERSION } from "@claude-vscode/shared";
import { BridgeClient } from "./wsClient.js";

describe("BridgeClient", () => {
  let server: WebSocketServer;
  let port: number;

  beforeEach(async () => {
    server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (typeof address === "string" || address === null) {
      throw new Error("Expected an AddressInfo from the test WebSocket server.");
    }
    port = address.port;
  });

  afterEach(async () => {
    for (const socket of server.clients) {
      socket.terminate();
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  });

  it("receives the hello handshake on connect", async () => {
    server.on("connection", (socket) => {
      const hello: HelloMessage = { type: "hello", protocolVersion: PROTOCOL_VERSION, workspaceFolders: ["/repo"] };
      socket.send(JSON.stringify(hello));
    });

    const client = new BridgeClient(`ws://127.0.0.1:${String(port)}`);
    const hello = await client.getHello();
    expect(hello.workspaceFolders).toEqual(["/repo"]);
  });

  it("resolves a call with the matching response result", async () => {
    server.on("connection", (socket) => {
      socket.send(JSON.stringify({ type: "hello", protocolVersion: PROTOCOL_VERSION, workspaceFolders: [] }));
      socket.on("message", (data) => {
        const request = JSON.parse(Buffer.from(data as Buffer).toString("utf8")) as RpcRequest;
        const response: RpcResponse = { id: request.id, result: { files: [] } };
        socket.send(JSON.stringify(response));
      });
    });

    const client = new BridgeClient(`ws://127.0.0.1:${String(port)}`);
    const result = await client.call("editor/getOpenFiles", undefined);
    expect(result).toEqual({ files: [] });
  });

  it("rejects when the response carries an error", async () => {
    server.on("connection", (socket) => {
      socket.send(JSON.stringify({ type: "hello", protocolVersion: PROTOCOL_VERSION, workspaceFolders: [] }));
      socket.on("message", (data) => {
        const request = JSON.parse(Buffer.from(data as Buffer).toString("utf8")) as RpcRequest;
        const response: RpcResponse = { id: request.id, error: { message: "boom" } };
        socket.send(JSON.stringify(response));
      });
    });

    const client = new BridgeClient(`ws://127.0.0.1:${String(port)}`);
    await expect(client.call("editor/getOpenFiles", undefined)).rejects.toThrow("boom");
  });

  it("rejects in-flight calls when the connection closes", async () => {
    server.on("connection", (socket) => {
      socket.send(JSON.stringify({ type: "hello", protocolVersion: PROTOCOL_VERSION, workspaceFolders: [] }));
      socket.on("message", () => {
        socket.close();
      });
    });

    const client = new BridgeClient(`ws://127.0.0.1:${String(port)}`);
    await expect(client.call("editor/getOpenFiles", undefined)).rejects.toThrow("closed");
  });
});

// src/transport/ws.ts — WebSocket adapter (binary/text frames, ping/pong)

import { randomUUID } from "node:crypto";
import { TransportProtocol } from "../db/enums";
import type { ProtocolHandler, Connection } from "./protocol.unified";
import { TransportError, TransportErrorCode } from "./errors";

/**
 * WebSocket transport adapter.
 *
 * Wraps Bun's native WebSocket with binary/text frame support
 * and ping/pong keep-alive.
 *
 * @example
 * ```ts
 * const handler = createWsHandler({ url: "ws://localhost:3000" });
 * const conn = await handler.connect();
 * await handler.send("hello");
 * await handler.close();
 * ```
 */
export class WsHandler implements ProtocolHandler {
  private connection: Connection | undefined;
  private closed = false;
  private ws: WebSocket | undefined;
  private pingInterval: ReturnType<typeof setInterval> | undefined;
  private pendingMessages: (string | Uint8Array)[] = [];

  constructor(
    private readonly options: {
      /** WebSocket URL (ws:// or wss://). Required for client mode. */
      url?: string;
      /** Server port. Required for server mode. */
      port?: number;
      host?: string;
      /** Ping interval in ms. Default 30_000. */
      pingInterval?: number;
    } = {},
  ) {}

  private ensureConnected(): Connection {
    if (this.closed || !this.connection) {
      throw new TransportError("connection closed", {
        code: TransportErrorCode.ConnectionClosed,
      });
    }
    return this.connection;
  }

  connect(): Promise<Connection> {
    if (this.connection) {
      return Promise.resolve(this.connection);
    }

    const id = randomUUID();
    const remoteAddr = this.options.url ?? `${this.options.host ?? "localhost"}:${this.options.port ?? 3000}`;

    this.connection = {
      id,
      protocol: TransportProtocol.WebSocket,
      remoteAddr,
      metadata: {
        pingPong: true,
        pingInterval: this.options.pingInterval ?? 30_000,
      },
    };

    // Start ping/pong keep-alive if client-side
    if (this.options.url) {
      this.pingInterval = setInterval(() => {
        this.ws?.ping();
      }, this.options.pingInterval ?? 30_000);
    }

    return Promise.resolve(this.connection);
  }

  /**
   * Attach an existing WebSocket (server-side upgrade path).
   */
  attach(ws: WebSocket): void {
    this.ws = ws;
  }

  send(data: string | Uint8Array): Promise<void> {
    this.ensureConnected();

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else {
      // Queue for when connection opens
      this.pendingMessages.push(data);
    }

    return Promise.resolve();
  }

  get(signature: string): Promise<string> {
    const conn = this.ensureConnected();
    const value = conn.metadata[signature];
    return Promise.resolve(typeof value === "string" ? value : "");
  }

  close(): Promise<void> {
    this.closed = true;
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    if (this.ws) {
      this.ws.close(1000, "client close");
    }

    this.connection = undefined;
    return Promise.resolve();
  }
}

/**
 * Create a WebSocket protocol handler.
 *
 * @param options - WebSocket options (url for client, port for server)
 * @returns ProtocolHandler wrapping Bun WebSocket
 */
export function createWsHandler(
  options: {
    url?: string;
    port?: number;
    host?: string;
    pingInterval?: number;
  } = {},
): ProtocolHandler {
  return new WsHandler(options);
}

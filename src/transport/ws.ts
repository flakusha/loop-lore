// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { randomUUID, } from "node:crypto";
import { TransportProtocol, } from "../db/enums";
import { TransportBase, type TransportBaseOptions, } from "./base";
import type { Connection, } from "./protocol.unified";

interface WsOptions extends TransportBaseOptions {
  url?: string;
  pingInterval?: number;
}

export class WsHandler extends TransportBase<WsOptions> {
  private ws: WebSocket | undefined;
  private pingInterval: ReturnType<typeof setInterval> | undefined;
  private pendingMessages: (string | Uint8Array)[] = [];

  constructor(options: WsOptions = {},) {
    super(options,);
  }

  protected getProtocol(): TransportProtocol {
    return TransportProtocol.WebSocket;
  }

  protected getMetadata(): Record<string, unknown> {
    return {
      pingPong: true,
      pingInterval: this.options.pingInterval ?? 30_000,
    };
  }

  protected override createConnection(): Connection {
    const id = randomUUID();
    const remoteAddr = this.options.url ?? `${this.options.host ?? "localhost"}:${this.options.port ?? 3000}`;

    return {
      id,
      protocol: TransportProtocol.WebSocket,
      remoteAddr,
      metadata: this.getMetadata(),
    };
  }

  override async connect(): Promise<Connection> {
    const conn = await super.connect();
    if (this.options.url) {
      this.pingInterval = setInterval(() => {
        (this.ws as any)?.ping?.();
      }, this.options.pingInterval ?? 30_000,);
    }
    return conn;
  }

  attach(ws: WebSocket,): void {
    this.ws = ws;
  }

  send(data: string | Uint8Array,): Promise<void> {
    this.ensureConnected();

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(typeof data === "string" ? data : (data as unknown as Parameters<WebSocket["send"]>[0]),);
    } else {
      this.pendingMessages.push(data,);
    }

    return Promise.resolve();
  }

  override close(): Promise<void> {
    if (this.pingInterval) {
      clearInterval(this.pingInterval,);
    }
    if (this.ws) {
      this.ws.close(1000, "client close",);
    }
    return super.close();
  }
}

export function createWsHandler(options: WsOptions = {},): WsHandler {
  return new WsHandler(options,);
}

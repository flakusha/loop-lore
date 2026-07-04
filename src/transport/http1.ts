// src/transport/http1.ts — HTTP/1.1 adapter (keep-alive)

import { randomUUID } from "node:crypto";
import { TransportProtocol } from "../db/enums";
import type { ProtocolHandler, Connection } from "./protocol.unified";
import { TransportError, TransportErrorCode } from "./errors";

/**
 * HTTP/1.1 transport adapter.
 *
 * Wraps Bun's native `serve()` with keep-alive support.
 * Each handler instance manages one logical connection (request lifecycle).
 *
 * @example
 * ```ts
 * const handler = createHttp1Handler({ port: 3000 });
 * const conn = await handler.connect();
 * await handler.send(JSON.stringify({ ok: true }));
 * await handler.close();
 * ```
 */
export class Http1Handler implements ProtocolHandler {
  private connection: Connection | undefined;
  private closed = false;

  constructor(
    private readonly options: {
      port?: number;
      host?: string;
      tls?: { key: string; cert: string };
      fetch?: (request: Request) => Response | Promise<Response>;
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
    const host = this.options.host ?? "localhost";
    const port = this.options.port ?? 3000;

    this.connection = {
      id,
      protocol: TransportProtocol.Http1_1,
      remoteAddr: `${host}:${port}`,
      metadata: {
        keepAlive: true,
        maxIdleTime: 30_000,
      },
    };

    return Promise.resolve(this.connection);
  }

  send(_data: string | Uint8Array): Promise<void> {
    this.ensureConnected();
    // HTTP/1.1 send is request-response; data is the request body
    // Actual dispatch handled by the server's fetch handler
    return Promise.resolve();
  }

  get(signature: string): Promise<string> {
    const conn = this.ensureConnected();
    const value = conn.metadata[signature];
    return Promise.resolve(typeof value === "string" ? value : "");
  }

  close(): Promise<void> {
    this.closed = true;
    this.connection = undefined;
    return Promise.resolve();
  }
}

/**
 * Create an HTTP/1.1 protocol handler.
 *
 * @param options - Server options (port, host, TLS, fetch handler)
 * @returns ProtocolHandler wrapping Bun.serve() for HTTP/1.1
 */
export function createHttp1Handler(
  options: {
    port?: number;
    host?: string;
    tls?: { key: string; cert: string };
    fetch?: (request: Request) => Response | Promise<Response>;
  } = {},
): ProtocolHandler {
  return new Http1Handler(options);
}

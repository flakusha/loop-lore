import { randomUUID, } from "node:crypto";
import type { TransportProtocol, } from "../db/enums";
import { TransportError, TransportErrorCode, } from "./errors";
import type { Connection, ProtocolHandler, } from "./protocol.unified";
import type { Connection, ProtocolHandler, } from "./protocol.unified";

/**
 * Shared options for all transport adapters.
 */
export interface TransportBaseOptions {
  port?: number;
  host?: string;
  tls?: { key: string; cert: string };
}

/**
 * Abstract base for transport adapters.
 *
 * Provides shared implementations for:
 * - `ensureConnected()` — guarded accessor
 * - `connect()` / `createConnection()` — id generation, host:port resolution
 * - `get()` — metadata lookup
 * - `close()` — basic teardown (subclass extends with cleanup)
 *
 * Subclasses implement:
 * - `getProtocol()` — return the protocol enum value
 * - `getMetadata()` — per-protocol connection metadata
 * - `send()` — transport-specific data transmission
 */
export abstract class TransportBase<
  TOptions extends TransportBaseOptions = TransportBaseOptions,
> implements ProtocolHandler {
  protected connection: Connection | undefined;
  protected closed = false;

  constructor(protected readonly options: TOptions,) {}

  protected ensureConnected(): Connection {
    if (this.closed || !this.connection) {
      throw new TransportError("connection closed", {
        code: TransportErrorCode.ConnectionClosed,
      },);
    }
    return this.connection;
  }

  connect(): Promise<Connection> {
    if (this.connection) {
      return Promise.resolve(this.connection,);
    }

    this.connection = this.createConnection();
    return Promise.resolve(this.connection,);
  }

  /**
   * Factory hook — override in subclass to customize connection shape.
   * Default builds remoteAddr from `host:port`.
   */
  protected createConnection(): Connection {
    const id = randomUUID();
    const host = this.options.host ?? "localhost";
    const port = this.options.port ?? 3000;

    return {
      id,
      protocol: this.getProtocol(),
      remoteAddr: `${host}:${port}`,
      metadata: this.getMetadata(),
    };
  }

  abstract send(data: string | Uint8Array,): Promise<void>;

  get(signature: string,): Promise<string> {
    const conn = this.ensureConnected();
    const value = conn.metadata[signature];
    return Promise.resolve(typeof value === "string" ? value : "",);
  }

  close(): Promise<void> {
    this.closed = true;
    this.connection = undefined;
    return Promise.resolve();
  }

  protected abstract getProtocol(): TransportProtocol;

  protected abstract getMetadata(): Record<string, unknown>;
}

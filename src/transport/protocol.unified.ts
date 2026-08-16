// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/transport/protocol.unified.ts — Core transport interfaces

import type { TransportProtocol, } from "../db/enums";

export type { TransportProtocol, } from "../db/enums";

/**
 * Represents an established transport connection.
 *
 * @property id - Unique connection identifier
 * @property protocol - Negotiated transport protocol
 * @property remoteAddr - Remote endpoint address
 * @property metadata - Arbitrary state bag (used by upgrade handoff)
 */
export interface Connection {
  id: string;
  protocol: TransportProtocol;
  remoteAddr: string;
  metadata: Record<string, unknown>;
}

/**
 * Unified protocol handler — all transport adapters implement this.
 *
 * `connect()` establishes the connection.
 * `send()` transmits data (string = text frame, Uint8Array = binary).
 * `get()` retrieves a value by key (negotiated capability, e.g. remote signature).
 * `close()` tears down gracefully.
 */
export interface ProtocolHandler {
  /** Establish connection. Resolves once connected. */
  connect(): Promise<Connection>;

  /** Send data over the connection. Throws on closed/failed connection. */
  send(data: string | Uint8Array,): Promise<void>;

  /** Retrieve negotiated value by signature key. */
  get(signature: string,): Promise<string>;

  /** Graceful close — drain in-flight, then tear down. */
  close(): Promise<void>;
}

/**
 * Event emitter shape for protocol handlers.
 * Adapters can implement this to emit connection lifecycle events.
 */
export interface ProtocolEvents {
  on(event: "open", listener: (connection: Connection,) => void,): void;
  on(event: "message", listener: (data: string | Uint8Array,) => void,): void;
  on(event: "error", listener: (error: Error,) => void,): void;
  on(event: "close", listener: (code: number, reason: string,) => void,): void;
  off(event: string, listener: (...args: unknown[]) => void,): void;
}

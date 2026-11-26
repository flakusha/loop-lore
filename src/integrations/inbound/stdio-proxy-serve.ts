// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * stdio-proxy-serve.ts — Design B stdio shim, per-connection serving.
 *
 * The graphs one accepted socket runs: an MCP socket gets `buildMcpServer`
 * over a line-delimited socket transport; an ACP socket gets the NDJSON line
 * handler. Both run through the server-resolved inbound principal, so
 * proxied ops are audited exactly like local turns.
 */

import { ReadBuffer, serializeMessage, } from "@modelcontextprotocol/sdk/shared/stdio.js";
import type { Transport, } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage, } from "@modelcontextprotocol/sdk/types.js";
import type { Kysely, } from "kysely";
import type { Socket, } from "node:net";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { safeJsonStringify, } from "../../utils";
import { connectInboundAcpServer, } from "../acp/stdio-server";
import { connectInboundMcpServer, } from "../mcp/stdio-server";

/** What the serve side closes over: the live database + config. */
export interface StdioProxyListenerDeps {
  database: Kysely<DB>;
  config: Config;
}

/** Minimal socket seam the MCP transport drives (real sockets fit). */
export interface ProxyTransportSocket {
  write(chunk: string, cb?: (err?: Error | null,) => void,): boolean;
  on(event: "data", listener: (chunk: Buffer,) => void,): unknown;
  off(event: "data", listener: (chunk: Buffer,) => void,): unknown;
  once(event: "close" | "error", listener: (arg?: unknown,) => void,): unknown;
  destroy(): unknown;
}

/**
 * SDK Transport over a socket, line-delimited exactly like
 * StdioServerTransport (same ReadBuffer/serializeMessage pair) so framing
 * behavior never drifts between local and proxied stdio.
 */
export class SocketProxyTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error,) => void;
  onmessage?: <T extends JSONRPCMessage,>(message: T,) => void;

  private readonly readBuffer = new ReadBuffer();
  private started = false;
  private closed = false;

  constructor(private readonly socket: ProxyTransportSocket,) {}

  /** Replay bytes that arrived with the handshake chunk (post-connect). */
  feed(chunk: Buffer,): void {
    this.appendChunk(chunk,);
  }

  async start(): Promise<void> {
    if (this.started) { throw new Error("SocketProxyTransport already started",); }
    this.started = true;
    this.socket.on("data", this.onData,);
    this.socket.once("close", this.onClose,);
    this.socket.once("error", this.onError,);
  }

  async send(message: JSONRPCMessage,): Promise<void> {
    const json = serializeMessage(message,);
    const { promise, resolve, reject, } = Promise.withResolvers<void>();
    this.socket.write(json, (err?: Error | null,) => {
      if (err) {
        reject(err,);
        return;
      }

      resolve();
    },);

    return promise;
  }

  async close(): Promise<void> {
    if (this.closed) { return; }
    this.closed = true;
    this.socket.off("data", this.onData,);
    this.readBuffer.clear();
    this.socket.destroy();
    this.onclose?.();
  }

  private readonly onData = (chunk: Buffer,): void => {
    this.appendChunk(chunk,);
  };

  private readonly onClose = (): void => {
    void this.close();
  };

  private readonly onError = (arg?: unknown,): void => {
    this.onerror?.(arg instanceof Error ? arg : new Error(String(arg,),),);
  };

  private appendChunk(chunk: Buffer,): void {
    try {
      this.readBuffer.append(chunk,);
    } catch (error) {
      this.onerror?.(error instanceof Error ? error : new Error(String(error,),),);
      return;
    }

    for (;;) {
      let message: JSONRPCMessage | null;
      try {
        message = this.readBuffer.readMessage();
      } catch (error) {
        this.onerror?.(error instanceof Error ? error : new Error(String(error,),),);
        return;
      }

      if (message === null) { break; }
      try {
        this.onmessage?.(message,);
      } catch (error) {
        this.onerror?.(error instanceof Error ? error : new Error(String(error,),),);
      }
    }
  }
}

/** Attach the MCP server graph to an accepted socket. */
export async function serveProxiedMcp(socket: Socket, deps: StdioProxyListenerDeps, rest: Buffer,): Promise<void> {
  const transport = new SocketProxyTransport(socket,);
  // connect() wires onmessage + start() BEFORE leftover bytes replay, so no
  // message delivered while the server was attaching is ever lost.
  const server = await connectInboundMcpServer(deps, transport,);
  if (server === null) {
    // The gate raced closed after the pre-check: local close only. The shim
    // sees EOF; the listener keeps serving everyone else.
    socket.destroy();
    return;
  }

  if (rest.length > 0) { transport.feed(rest,); }
}

/** Attach the ACP line handler to an accepted socket (serial, like stdio). */
export function serveProxiedAcp(socket: Socket, deps: StdioProxyListenerDeps, rest: Buffer,): void {
  const writeLine = (message: unknown,): void => {
    if (typeof message === "string") {
      socket.write(`${message}\n`,);
      return;
    }

    const serialized = safeJsonStringify(message,);
    if (serialized.ok) { socket.write(`${serialized.value}\n`,); }
  };

  const handler = connectInboundAcpServer(deps, writeLine,);
  if (handler === null) {
    socket.destroy();
    return;
  }

  let pending = rest.length > 0 ? rest.toString("utf8",) : "";
  let tail: Promise<void> = Promise.resolve();
  const onData = (chunk: Buffer,): void => {
    pending += chunk.toString("utf8",);
    const lines = pending.split("\n",);
    pending = lines.pop() ?? "";
    for (const line of lines) { tail = tail.then(() => handler(line,)); }
  };

  socket.on("data", onData,);
  socket.once("close", () => {
    socket.off("data", onData,);
  },);
}

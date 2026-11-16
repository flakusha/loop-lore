// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * stdio-proxy-listener.ts — Design B stdio shim, server half.
 *
 * A loopback-only TCP listener serving the SAME per-connection graphs as
 * the standalone stdio mains: an MCP connection gets `buildMcpServer` over
 * a socket Content-Length transport; an ACP connection gets the NDJSON line
 * handler. Every op runs through `runFacadeOp` with the server-minted
 * inbound principal, so proxied ops are audited exactly like local turns.
 *
 * Trust: the first line of every connection is the JSON handshake
 * (`stdio-proxy.ts`); the bearer token is compared in constant time against
 * the state-dir token file. Bad/missing tokens AND disabled-gate probes are
 * refused with `{"ok":false}` and audited as `proxy.connect` 401/403 rows.
 * A non-loopback bind is REFUSED outright — remote bind needs TLS+token and
 * belongs to the filed remote-harness epic, not this slice.
 *
 * Never-stop semantics: a client EOF/close destroys only its socket (the
 * transport's onclose runs, ACP sessions GC with the closure). The listener
 * — and the server — keep running. stdio is never read here.
 */

import { ReadBuffer, serializeMessage, } from "@modelcontextprotocol/sdk/shared/stdio.js";
import type { Transport, } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage, } from "@modelcontextprotocol/sdk/types.js";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { unlinkSync, } from "node:fs";
import { createServer, type Server as NetServer, type Socket, } from "node:net";
import type { Config, } from "../../config/schema";
import { type StateEnv, } from "../../config/state-dir";
import type { DB, } from "../../db/schema";
import { principalKind, } from "../../middleware/principal-kind";
import { safeJsonStringify, } from "../../utils";
import { connectInboundAcpServer, } from "../acp/stdio-server";
import { writeFacadeAudit, } from "../loop-lore-facade/audit";
import type { FacadePrincipal, } from "../loop-lore-facade/types";
import { connectInboundMcpServer, } from "../mcp/stdio-server";
import { effectiveInboundSettings, type InboundTransport, } from "./principal";
import {
  decodeProxyHandshake,
  encodeProxyAck,
  ensureProxyToken,
  isLoopbackHost,
  proxyAddrPath,
  readProxyToken,
  readSocketLine,
  resolveProxyBind,
  STDIO_PROXY_LOOPBACK_DEFAULT,
  verifyProxyToken,
  writeProxyAddr,
} from "./stdio-proxy";

/** What the listener closes over: the live database + config. */
export interface StdioProxyListenerDeps {
  database: Kysely<DB>;
  config: Config;
}

/** A running listener: its addr file entry plus a stop handle. */
export interface StdioProxyListener {
  readonly addr: string;
  readonly host: string;
  readonly port: number;
  close(): Promise<void>;
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

/** Principal stamped on refused-connection audit rows (no identity). */
function rejectedProxyPrincipal(): FacadePrincipal {
  return {
    kind: principalKind("external-agent",),
    userId: null,
    userRole: null,
    credentialId: null,
    credentialName: "stdio-proxy",
    credentialScope: null,
  };
}

/** Refuse + audit one connection without ever serving it. */
async function refuseConnection(
  socket: Socket,
  deps: StdioProxyListenerDeps,
  status: number,
  error: string,
): Promise<void> {
  await writeFacadeAudit(deps.database, {
    op: "proxy.connect",
    domain: "inbound",
    scope: "read",
    status,
    principal: rejectedProxyPrincipal(),
    requestId: `proxy-${randomUUID()}`,
  },);

  socket.write(encodeProxyAck(false, error,),);
  socket.destroy();
}

/** Serve one accepted socket with the connection's protocol graph. */
async function handleProxyConnection(
  socket: Socket,
  deps: StdioProxyListenerDeps,
  env: StateEnv = process.env,
): Promise<void> {
  const first = await readSocketLine(socket,);
  if (first === null) {
    await refuseConnection(socket, deps, 401, "unauthorized: bad or missing proxy token",);
    return;
  }

  const handshake = decodeProxyHandshake(first.line,);
  const expected = readProxyToken(env,);
  if (handshake === null || expected === null || !verifyProxyToken(handshake.token, expected,)) {
    await refuseConnection(socket, deps, 401, "unauthorized: bad or missing proxy token",);
    return;
  }

  const transport: InboundTransport = handshake.protocol === "mcp" ? "mcp-stdio" : "acp-stdio";
  if (effectiveInboundSettings(transport,) === null) {
    await refuseConnection(socket, deps, 403, "inbound server disabled or principal unconfigured",);
    return;
  }

  socket.write(encodeProxyAck(true,),);
  if (handshake.protocol === "mcp") {
    await serveProxiedMcp(socket, deps, first.rest,);
    return;
  }

  serveProxiedAcp(socket, deps, first.rest,);
}

/** Attach the MCP server graph to an accepted socket. */
async function serveProxiedMcp(socket: Socket, deps: StdioProxyListenerDeps, rest: Buffer,): Promise<void> {
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
function serveProxiedAcp(socket: Socket, deps: StdioProxyListenerDeps, rest: Buffer,): void {
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

/**
 * Start the loopback-only proxy listener. Resolves once listening; the
 * address is written to the instance addr file for bare `--proxy` shims.
 * @param deps - live database/config (+ optional bind overrides for tests)
 * @param env - environment to resolve the instance dir from
 * @throws {Error} when the bind is not loopback (remote bind is refused)
 */
export async function startStdioProxyListener(
  deps: StdioProxyListenerDeps & { host?: string; port?: number },
  env: StateEnv = process.env,
): Promise<StdioProxyListener> {
  const host = deps.host ?? resolveProxyBind(deps.config,);
  if (!isLoopbackHost(host,)) {
    throw new Error(
      `stdio-proxy: refusing non-loopback bind "${host}" without TLS+token — remote bind is the remote-harness epic`,
    );
  }

  ensureProxyToken(env,);
  const { promise, resolve, reject, } = Promise.withResolvers<void>();
  const server: NetServer = createServer((socket,) => {
    socket.once("error", () => {
      // Swallowed: the "close" that follows ends the relay either way.
    },);

    handleProxyConnection(socket, deps, env,).catch(() => {
      // A throwing handler must never kill the server: drop the socket.
      try {
        socket.destroy();
      } catch {
        /* already gone */
      }
    },);
  },);

  server.once("error", reject,);
  server.listen(deps.port ?? 0, host, () => {
    server.off("error", reject,);
    resolve();
  },);

  await promise;

  const info = server.address();
  if (typeof info !== "object" || info === null) {
    server.close();
    throw new Error("stdio-proxy: listener address unavailable after listen",);
  }

  const listenHost = info.address === "::" ? STDIO_PROXY_LOOPBACK_DEFAULT : info.address;
  const addr = listenHost.includes(":",) ? `[${listenHost}]:${info.port}` : `${listenHost}:${info.port}`;
  writeProxyAddr(addr, env,);
  return {
    addr,
    host: listenHost,
    port: info.port,
    close: async (): Promise<void> => {
      const { promise: done, resolve: finish, } = Promise.withResolvers<void>();
      server.close(() => finish());
      await done;
      try {
        unlinkSync(proxyAddrPath(env,),);
      } catch {
        /* best-effort addr cleanup */
      }
    },
  };
}

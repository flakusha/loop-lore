// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * stdio-proxy-listener.ts — Design B stdio shim, server half.
 *
 * A loopback-only TCP listener serving the SAME per-connection graphs as
 * the standalone stdio mains (see `stdio-proxy-serve.ts`): an MCP socket
 * gets the MCP server graph over a line-delimited socket transport; an ACP
 * socket gets the NDJSON line handler. Every op runs with the
 * server-resolved inbound principal, so proxied ops are audited exactly
 * like local turns.
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

import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { unlinkSync, } from "node:fs";
import { createServer, type Server as NetServer, type Socket, } from "node:net";
import type { Config, } from "../../config/schema";
import { type StateEnv, } from "../../config/state-dir";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { principalKind, } from "../../middleware/principal-kind";
import { writeFacadeAudit, } from "../loop-lore-facade/audit";
import type { FacadePrincipal, } from "../loop-lore-facade/types";
import { effectiveInboundSettings, type InboundTransport, } from "./principal";
import { getInboundSettings, } from "./settings";
import {
  decodeProxyHandshake,
  encodeProxyAck,
  ensureProxyToken,
  isLoopbackHost,
  proxyAddrPath,
  readProxyToken,
  resolveProxyBind,
  STDIO_PROXY_LOOPBACK_DEFAULT,
  verifyProxyToken,
  writeProxyAddr,
} from "./stdio-proxy";
import { readSocketLine, } from "./stdio-proxy-relay";
import {
  serveProxiedAcp,
  serveProxiedMcp,
  type StdioProxyListenerDeps,
} from "./stdio-proxy-serve";

/** A running listener: its addr file entry plus a stop handle. */
export interface StdioProxyListener {
  readonly addr: string;
  readonly host: string;
  readonly port: number;
  close(): Promise<void>;
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

/**
 * Boot wiring for the Design B listener: start it only when an inbound
 * server is enabled, else leave it stopped (never reads stdio itself — it
 * only serves `--proxy` shims). Logs once with the same shape as the other
 * boot lines; shutdown stays with the caller.
 * @param database - live database for proxied-op auditing
 * @param config - app config (bind + feature gates)
 * @returns the running listener, or undefined when both servers are disabled
 */
export async function maybeStartStdioProxyListener(
  database: Kysely<DB>,
  config: Config,
): Promise<StdioProxyListener | undefined> {
  const inbound = getInboundSettings();
  if (!inbound.mcpEnabled && !inbound.acpEnabled) { return undefined; }

  const listener = await startStdioProxyListener({ database, config, },);
  getLogger().info(`stdio-proxy → ${listener.addr}`, { module: "server", },);
  return listener;
}

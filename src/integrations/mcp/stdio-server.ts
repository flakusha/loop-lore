// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * inbound MCP studio server — stdio transport (epic-agentic-integration-mcp-acp
 * §3.3: "the same SDK `Server` attaches to `StdioServerTransport`").
 *
 * The PROTOCOL layer is the facade's `buildMcpServer` (tools derive from the
 * op registry manifest; execution is runFacadeOp with the server-resolved
 * principal) — this module only owns the INBOUND wiring: the deny-by-default
 * admission gate (`buildInboundFacadeContext`) and the stdio attach. The
 * connecting principal is the operator-configured inbound principal, scoped
 * by the facade tier ladder — never caller-supplied.
 *
 * Run standalone (`bun run src/integrations/mcp/stdio-server.ts`); an MCP
 * client spawns it with `integrations.inbound.mcpEnabled` configured. When
 * the gate refuses, the process exits non-zero with a stderr diagnostic and
 * NEVER serves a tool.
 */

import { StdioServerTransport, } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport, } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { Kysely, } from "kysely";
import { APP_VERSION, } from "../../config/constants";
import { loadConfig, } from "../../config/load";
import type { Config, } from "../../config/schema";
import type { StateEnv, } from "../../config/state-dir";
import { getDatabase, } from "../../db/index";
import type { DB, } from "../../db/schema";
import { createLogger, getLogger, } from "../../logger";
import { buildInboundFacadeContext, } from "../inbound/principal";
import { parseProxyAddr, resolveProxyClient, } from "../inbound/stdio-proxy";
import { runStdioProxyRelay, } from "../inbound/stdio-proxy-relay";
import { getFacadeRegistry, } from "../loop-lore-facade/instance";
import { buildMcpServer, MCP_SERVER_NAME, } from "../loop-lore-facade/mcp/server";
import type { FacadeContext, } from "../loop-lore-facade/types";

/** Deps the stdio server needs, injectable for tests (no fixed stdio). */
export interface InboundMcpDeps {
  database: Kysely<DB>;
  config: Config;
}

/**
 * Build + connect the inbound MCP server over the given transport. Exported
 * (instead of hard-wiring StdioServerTransport) so tests drive the SAME
 * server graph over an InMemoryTransport peer.
 * @param deps - database/config the registry + principal resolve against
 * @param transport - the connect-ready transport (stdio in production)
 * @param requestId - audit/request id for this connection
 * @returns {Promise<Server | null>} the connected server, or null when the
 *   admission gate refused (disabled/unseeded/no principal) — callers exit.
 */
export async function connectInboundMcpServer(
  deps: InboundMcpDeps,
  transport: Transport,
  requestId = `mcp-stdio-${crypto.randomUUID()}`,
) {
  const ctx: FacadeContext | null = buildInboundFacadeContext(
    deps.database,
    deps.config,
    "mcp-stdio",
    requestId,
  );

  if (ctx === null) { return null; }

  const server = buildMcpServer({
    registry: getFacadeRegistry(deps,),
    version: APP_VERSION,
    ctx,
  },);

  await server.connect(transport,);
  return server;
}

/**
 * `--proxy [addr]` entrypoint: own stdio, relay bytes to the running
 * server's local-only listener, and exit when the relay ends. The database
 * is never opened here — ops run (and are audited) server-side. stdio
 * EOF/close ends only this relay; the server keeps running.
 * @param addrArg - the `--proxy` address arg ("" reads the addr file)
 * @param opts - stdio/env seams (default: this process); tests pass fakes
 */
export async function mainProxy(
  addrArg: string,
  opts?: { input?: NodeJS.ReadableStream; output?: NodeJS.WritableStream; env?: StateEnv },
): Promise<void> {
  createLogger();
  const logger = getLogger();
  let client;
  try {
    client = resolveProxyClient(addrArg, opts?.env,);
  } catch (error) {
    logger.warn(
      `inbound MCP stdio proxy refused to start: ${(error as Error).message}`,
      { module: MCP_SERVER_NAME, },
    );

    process.exitCode = 1;
    return;
  }

  const code = await runStdioProxyRelay({
    input: opts?.input ?? process.stdin,
    output: opts?.output ?? process.stdout,
    addr: client.addr,
    token: client.token,
    protocol: "mcp",
  },);

  if (code !== 0) {
    logger.error("inbound MCP stdio proxy relay failed", undefined, { module: MCP_SERVER_NAME, },);
    process.exitCode = 1;
    return;
  }

  logger.info("inbound MCP stdio proxy closed; the server keeps running", { module: MCP_SERVER_NAME, },);
}

/**
 * Production entrypoint: load config, open the database, serve the facade
 * tools over stdio. Exits 1 with a stderr diagnostic when the inbound gate
 * refuses (deny-by-default).
 */
export async function main(): Promise<void> {
  const proxyArg = parseProxyAddr(process.argv,);
  if (proxyArg !== undefined) {
    await mainProxy(proxyArg,);
    return;
  }

  createLogger();
  const config = loadConfig();
  const logger = getLogger();
  const database = getDatabase();

  const server = await connectInboundMcpServer({ database, config, }, new StdioServerTransport(),);
  if (server === null) {
    logger.warn(
      "inbound MCP stdio server refused to start: integrations.inbound is disabled or has no principal",
      { module: MCP_SERVER_NAME, },
    );

    process.exitCode = 1;
    return;
  }

  logger.info("inbound MCP stdio server ready", { module: MCP_SERVER_NAME, },);
}

if (import.meta.main) {
  void main();
}

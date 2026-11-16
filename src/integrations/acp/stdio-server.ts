// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * inbound ACP studio server — stdio transport (epic-agentic-integration-mcp-acp
 * §3.3).
 *
 * Combines the §3.3 admission gate (`buildInboundFacadeContext`) with the
 * NDJSON wire loop: one line of client JSON-RPC in, one JSON-RPC message
 * out through `createAcpAgentHandler`. Runs standalone
 * (`bun run src/integrations/acp/stdio-server.ts`); an ACP client (Studio)
 * spawns it with `integrations.inbound.acpEnabled` configured. When the
 * gate refuses, the process exits non-zero with a stderr diagnostic and
 * NEVER serves a session.
 */

import type { Kysely, } from "kysely";
import { createInterface, } from "node:readline";
import { loadConfig, } from "../../config/load";
import type { Config, } from "../../config/schema";
import type { StateEnv, } from "../../config/state-dir";
import { getDatabase, } from "../../db/index";
import type { DB, } from "../../db/schema";
import { createLogger, getLogger, } from "../../logger";
import { safeJsonStringify, } from "../../utils";
import { buildInboundFacadeContext, } from "../inbound/principal";
import { parseProxyAddr, resolveProxyClient, runStdioProxyRelay, } from "../inbound/stdio-proxy";
import { getFacadeRegistry, } from "../loop-lore-facade/instance";
import { createAcpAgentHandler, } from "./agent-server";

/** Deps the stdio server needs, injectable for tests (no fixed stdio). */
export interface InboundAcpDeps {
  database: Kysely<DB>;
  config: Config;
}

/**
 * Build the inbound ACP agent's line handler for one stdio connection, or
 * null when the admission gate refuses (disabled/unseeded/no principal).
 * @param deps - database/config the registry + principal resolve against
 * @param write - sink for the server's NDJSON output lines (production:
 *   process.stdout)
 * @param requestId - audit/request id for this connection
 * @returns {((line: string) => Promise<void>) | null} the handler or the
 *   refusal
 */
export function connectInboundAcpServer(
  deps: InboundAcpDeps,
  write: (message: unknown,) => void,
  requestId = `acp-stdio-${crypto.randomUUID()}`,
): ((line: string,) => Promise<void>) | null {
  const ctx = buildInboundFacadeContext(deps.database, deps.config, "acp-stdio", requestId,);
  if (ctx === null) { return null; }

  return createAcpAgentHandler({
    registry: getFacadeRegistry(deps,),
    ctx,
    write: (message,) => {
      const serialized = safeJsonStringify(message,);
      if (serialized.ok) { write(serialized.value,); }
    },
  },);
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
      `inbound ACP stdio proxy refused to start: ${(error as Error).message}`,
      { module: "acp-inbound", },
    );

    process.exitCode = 1;
    return;
  }

  const code = await runStdioProxyRelay({
    input: opts?.input ?? process.stdin,
    output: opts?.output ?? process.stdout,
    addr: client.addr,
    token: client.token,
    protocol: "acp",
  },);

  if (code !== 0) {
    logger.error("inbound ACP stdio proxy relay failed", undefined, { module: "acp-inbound", },);
    process.exitCode = 1;
    return;
  }

  logger.info("inbound ACP stdio proxy closed; the server keeps running", { module: "acp-inbound", },);
}

/**
 * Production entrypoint: load config, open the database, serve ACP v1 over
 * stdin/stdout NDJSON. Exits 1 with a stderr diagnostic when the inbound
 * gate refuses (deny-by-default).
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

  const write = (message: unknown,): void => {
    if (typeof message === "string") {
      process.stdout.write(`${message}\n`,);
      return;
    }

    const serialized = safeJsonStringify(message,);
    if (serialized.ok) { process.stdout.write(`${serialized.value}\n`,); }
  };

  const handler = connectInboundAcpServer({ database, config, }, write,);
  if (handler === null) {
    logger.warn(
      "inbound ACP stdio server refused to start: integrations.inbound is disabled or has no principal",
      { module: "acp-inbound", },
    );

    process.exitCode = 1;
    return;
  }

  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity, },);
  for await (const line of rl) {
    await handler(line,);
  }

  logger.info("inbound ACP stdio server closed", { module: "acp-inbound", },);
}

if (import.meta.main) {
  void main();
}

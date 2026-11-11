// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * stdio-server.test.ts — the inbound MCP studio server (§3.3).
 *
 * Drives the SAME server graph production attaches to StdioServerTransport
 * over an InMemoryTransport peer (the SDK's own transport pair), so the
 * protocol layer is exercised for real: tools/list generates from the
 * facade manifest, tools/call runs the facade lifecycle with the inbound
 * principal, and the deny-by-default gate refuses to build the server at
 * all when `integrations.inbound` is unseeded/disabled/principal-less.
 *
 * Resource contract (parallel-safe): one :memory: SQLite per file, registry
 * reset per build, no ports/env.
 */

import { Client, } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport, } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertChatParticipants, insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import { initInboundSettings, resetInboundSettings, } from "../inbound/settings";
import { resetFacadeRegistry, } from "../loop-lore-facade/instance";
import { connectInboundMcpServer, } from "./stdio-server";

const USER = "mcp-stdio-user";
const CHAT = "mcp-stdio-chat";

let testDb: TestDb;
let db: Kysely<DB>;
let baseConfig: Config;

/** A config copy with one inbound override applied. */
function configWith(inbound: Partial<Config["integrations"]["inbound"]>,): Config {
  return {
    ...baseConfig,
    integrations: {
      ...baseConfig.integrations,
      inbound: { ...baseConfig.integrations.inbound, ...inbound, },
    },
  };
}

/** A connected MCP client talking to the inbound server over memory. */
async function makeClient(cfg: Config,) {
  resetFacadeRegistry();
  const [serverTransport, clientTransport,] = InMemoryTransport.createLinkedPair();
  const server = await connectInboundMcpServer({ database: db, config: cfg, }, serverTransport,);
  if (server === null) { return null; }

  const client = new Client({ name: "studio-test-client", version: "0.0.0", },);
  await client.connect(clientTransport,);
  return client;
}

beforeAll(async () => {
  createLogger({ level: "error", },);
  testDb = await createTestDb();
  db = testDb.db;
  baseConfig = createConfigSchema().defaults as unknown as Config;

  await insertUsers(db, USER, "MCP Operator", { id: USER, },);
  await insertActors(db, "MCP Operator", { id: USER, user_id: USER, owner_id: USER, },);
  await insertChats(db, "mcp-stdio", USER, { id: CHAT, },);
  await insertChatParticipants(db, CHAT, USER, { role_in_chat: "owner", },);
},);

afterAll(async () => {
  resetFacadeRegistry();
  resetInboundSettings();
  await destroyTestDb(testDb,);
},);

describe("inbound MCP stdio server", () => {
  test("the deny-by-default gate refuses unseeded / disabled / principal-less configs", async () => {
    // Unseeded store.
    resetFacadeRegistry();
    const [t0, ,] = InMemoryTransport.createLinkedPair();
    expect(await connectInboundMcpServer({ database: db, config: baseConfig, }, t0,),).toBeNull();

    // Seeded but disabled (schema defaults).
    initInboundSettings({ mcpEnabled: false, acpEnabled: false, principalUserId: "", principalScope: "read", },);
    resetFacadeRegistry();
    const [t1, ,] = InMemoryTransport.createLinkedPair();
    expect(await connectInboundMcpServer({ database: db, config: baseConfig, }, t1,),).toBeNull();

    // Enabled but no principal.
    initInboundSettings({ mcpEnabled: true, acpEnabled: false, principalUserId: "", principalScope: "read", },);
    resetFacadeRegistry();
    const [t2, ,] = InMemoryTransport.createLinkedPair();
    expect(await connectInboundMcpServer({ database: db, config: baseConfig, }, t2,),).toBeNull();
  });

  test("tools/list generates from the facade manifest", async () => {
    initInboundSettings({ mcpEnabled: true, acpEnabled: false, principalUserId: USER, principalScope: "read", },);
    const client = await makeClient(configWith({ mcpEnabled: true, principalUserId: USER, },),);
    expect(client,).not.toBeNull();

    const tools = await client!.listTools();
    const names = tools.tools.map((tool,) => tool.name).sort();
    expect(names,).toContain("chat.send",);
    expect(names,).toContain("chat.history",);
    await client!.close();
  });

  test("tools/call chat.history runs the facade lifecycle with the inbound principal", async () => {
    const client = await makeClient(configWith({ mcpEnabled: true, principalUserId: USER, principalScope: "read", },),);
    expect(client,).not.toBeNull();

    const result = await client!.callTool({ name: "chat.history", arguments: { chatId: CHAT, }, },);
    expect(result.isError,).toBeUndefined();

    const text = (result.content as Array<{ text: string }>)[0]?.text ?? "null";
    const body = JSON.parse(text,) as { data?: unknown[] };
    expect(Array.isArray(body.data,),).toBe(true,);
    await client!.close();
  });

  test("a read-tier principal is refused chat.send with the 403-class tool error", async () => {
    const client = await makeClient(configWith({ mcpEnabled: true, principalUserId: USER, principalScope: "read", },),);
    expect(client,).not.toBeNull();

    const result = await client!.callTool({
      name: "chat.send",
      arguments: { chatId: CHAT, content: "denied by stdio", },
    },);

    expect(result.isError,).toBe(true,);

    const text = (result.content as Array<{ text: string }>)[0]?.text ?? "null";
    const body = JSON.parse(text,) as { error?: string };
    expect(body.error,).toBe("forbidden",);

    const rows = await db.selectFrom("messages",).selectAll().where("content", "=", "denied by stdio",).execute();
    expect(rows,).toHaveLength(0,);
    await client!.close();
  });
});

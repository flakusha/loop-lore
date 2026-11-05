// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/loop-lore-facade/mcp/routes.test.ts — the MCP transport
// exercised through the ACTUAL Elysia plugin via app.handle (bare app +
// derive standing in for the auth middleware). Covers: initialize
// negotiation (SDK downgrade rule; supported versions echo verbatim),
// tools/list from the registry, real tools/call (chat.history roundtrip +
// isError mapping), protocol errors (-32601/-32700/-32602), notification
// 202, batch arrays, GET 405, HTTP-level 401, adversarial body principal
// inert. Resource contract (parallel-safe): one :memory: SQLite per file via
// createTestDb, no ports, no env, no sleeps; config is the real schema
// defaults so the tool pipeline completes.

import { LATEST_PROTOCOL_VERSION, } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../../config/schema";
import { createConfigSchema, } from "../../../config/schema-class";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, destroyTestDb, type TestDb, } from "../../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../../test-utils/insert-helpers";
import { resetFacadeRegistry, } from "../instance";
import { createMcpRoutes, } from "./routes";

const USER = "mcp-http-user";
const CHAT = "mcp-http-chat-1";
const PREFIX = "/api/v1";

let testDb: TestDb;
let db: Kysely<DB>;
let config: Config;

beforeAll(async () => {
  createLogger({ level: "error", },);
  testDb = await createTestDb();
  db = testDb.db;
  // Real schema defaults: the chat pipeline reads config.generation.
  config = createConfigSchema().defaults as unknown as Config;

  await insertUsers(db, USER, "MCP HTTP User", { id: USER, },);
  await insertActors(db, "MCP HTTP User", { id: USER, user_id: USER, owner_id: USER, },);
  await insertChats(db, "mcp-http-chat", USER, { id: CHAT, },);
  await insertChatParticipants(db, CHAT, USER, { role_in_chat: "owner", },);
  await insertMessages(db, CHAT, USER, "user", "hello agent",);
},);

afterAll(async () => {
  resetFacadeRegistry();
  await destroyTestDb(testDb,);
},);

function makeApp(userId: string | null, requestId = "req-mcp-test",): Elysia {
  resetFacadeRegistry();
  const app = new Elysia({ name: "test-mcp-routes", },);
  app.derive(() => ({ userId, userRole: userId === null ? null : "user", sessionId: null, requestId, }));

  return app.use(createMcpRoutes({ database: db, config, }, PREFIX,),);
}

function rpc(method: string, params?: unknown, id?: number,): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json", },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method,
      ...(params === undefined ? {} : { params, }),
      ...(id === undefined ? {} : { id, }),
    },),
  };
}

/** Spec-mandated initialize params (capabilities + clientInfo required). */
const initParams = (protocolVersion: string,) => ({
  protocolVersion,
  capabilities: {},
  clientInfo: { name: "probe", version: "0", },
});

async function call(app: Elysia, init: RequestInit,): Promise<Response> {
  return await app.handle(new Request(`http://localhost${PREFIX}/integrations/mcp`, init,),);
}

interface Envelope {
  jsonrpc: string;
  id: number | string | null;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

interface HistoryResult {
  content: Array<{ type: string; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

describe("MCP transport over the facade registry", () => {
  test("anonymous POST is 401 at the HTTP layer", async () => {
    const res = await call(makeApp(null,), rpc("initialize", { protocolVersion: "2026-07-28", }, 1,),);
    expect(res.status,).toBe(401,);
  });

  test("a revision newer than the SDK answers the SDK's latest (downgrade)", async () => {
    // The epic pinned 2026-07-28; SDK 1.32.2 tops out earlier, so the spec's
    // negotiation rule applies (a SUPPORTED version echoes verbatim - the
    // batch test asserts that). Unsupported request -> server's LATEST.
    const res = await call(makeApp(USER,), rpc("initialize", initParams("2026-07-28",), 1,),);

    expect(res.status,).toBe(200,);
    const envelope = await res.json() as Envelope;
    const result = envelope.result as { protocolVersion: string };
    expect(result.protocolVersion,).toBe(LATEST_PROTOCOL_VERSION,);
  });

  test("tools/list surfaces registry ops with descriptions + inputSchema", async () => {
    const res = await call(makeApp(USER,), rpc("tools/list", {}, 2,),);
    expect(res.status,).toBe(200,);

    const envelope = await res.json() as Envelope;
    const tools = envelope.result?.tools as Array<{
      name: string;
      description: string;
      inputSchema: unknown;
    }>;

    expect(tools.map((t,) => t.name),).toContain("chat.send",);
    expect(tools.map((t,) => t.name),).toContain("chat.history",);
    expect(tools.map((t,) => t.name),).toContain("generation.generate",);
    for (const tool of tools) {
      expect(tool.description.length,).toBeGreaterThan(0,);
      expect(tool.inputSchema,).toBeDefined();
    }
  });

  test("tools/call executes a real chat.history over HTTP", async () => {
    const res = await call(
      makeApp(USER,),
      rpc("tools/call", { name: "chat.history", arguments: { chatId: CHAT, }, }, 3,),
    );

    expect(res.status,).toBe(200,);

    const envelope = await res.json() as Envelope;
    const result = envelope.result as unknown as HistoryResult;

    expect(result.isError,).toBeUndefined();
    expect(result.content[0]?.type,).toBe("text",);
    const text = JSON.parse(result.content[0]?.text ?? "null",) as { data?: Array<{ content?: string }> };
    expect(text.data?.some((m,) => m.content === "hello agent"),).toBe(true,);
    expect(result.structuredContent,).toBeDefined();
  });

  test("tools/call maps a not-found chat onto isError content", async () => {
    const res = await call(
      makeApp(USER,),
      rpc("tools/call", { name: "chat.history", arguments: { chatId: "nope", }, }, 4,),
    );

    expect(res.status,).toBe(200,);
    const envelope = await res.json() as Envelope;
    const result = envelope.result as unknown as HistoryResult;
    expect(result.isError,).toBe(true,);
    expect(result.content[0]?.text,).toContain("Chat not found",);
  });

  test("protocol errors: unknown tool -32602, unknown method -32601, malformed -32700", async () => {
    const tool = await call(makeApp(USER,), rpc("tools/call", { name: "no.such-tool", arguments: {}, }, 5,),);
    const toolEnvelope = await tool.json() as Envelope;
    expect(toolEnvelope.error?.code,).toBe(-32602,);

    const method = await call(makeApp(USER,), rpc("resources/list", {}, 6,),);
    const methodEnvelope = await method.json() as Envelope;
    expect(methodEnvelope.error?.code,).toBe(-32601,);

    // parse:"none" keeps the raw body reachable so the parse error is answerable with a null id.
    const malformed = await call(makeApp(USER,), {
      method: "POST",
      headers: { "content-type": "application/json", },
      body: "{jsonrpc:2.0 broken",
    },);

    const malformedEnvelope = await malformed.json() as Envelope;
    expect(malformedEnvelope.error?.code,).toBe(-32700,);
    expect(malformedEnvelope.id,).toBeNull();
  });

  test("a notification answers 202; GET is 405 (no SSE stream)", async () => {
    const posted = await call(makeApp(USER,), rpc("notifications/initialized",),);
    expect(posted.status,).toBe(202,);
    expect(await posted.text(),).toBe("",);

    const got = await makeApp(USER,).handle(new Request(`http://localhost${PREFIX}/integrations/mcp`,),);
    expect(got.status,).toBe(405,);
    expect(got.headers.get("allow",),).toBe("POST",);
  });

  test("a batch array answers envelopes in order (initialize + tools/list + ping)", async () => {
    const init = { jsonrpc: "2.0", id: 10, method: "initialize", params: initParams("2025-06-18",), };
    const list = { jsonrpc: "2.0", id: 11, method: "tools/list", params: {}, },
      ping = { jsonrpc: "2.0", id: 12, method: "ping", };

    const res = await call(makeApp(USER,), {
      method: "POST",
      headers: { "content-type": "application/json", },
      body: JSON.stringify([init, list, ping,],),
    },);

    expect(res.status,).toBe(200,);
    const envelopes = await res.json() as Envelope[];

    expect(envelopes.map((e,) => e.id),).toEqual([10, 11, 12,],);
    expect((envelopes[0]?.result as { protocolVersion?: string }).protocolVersion,).toBe("2025-06-18",);
    expect(Array.isArray((envelopes[1]?.result as { tools?: unknown[] }).tools,),).toBe(true,);
    expect(envelopes[2]?.result,).toEqual({},);
  });

  test("adversarial body principal is inert — identity from the context only", async () => {
    // If the body's principal-shaped fields were trusted, the tool call would
    // run as "attacker" (no chat access -> isError 404). It must run as USER.
    const res = await call(
      makeApp(USER, "req-mcp-adv",),
      rpc("tools/call", {
        name: "chat.history",
        arguments: { chatId: CHAT, userId: "attacker", userRole: "admin", },
      }, 7,),
    );

    expect(res.status,).toBe(200,);
    const envelope = await res.json() as Envelope;
    const result = envelope.result as unknown as HistoryResult;
    expect(result.isError,).toBeUndefined();
    expect(result.content[0]?.text,).toContain("hello agent",);

    const row = await db.selectFrom("log_entries",).selectAll()
      .where("event_type", "=", "facade.op",)
      .where("request_id", "=", "req-mcp-adv",)
      .executeTakeFirst();

    expect(row?.user_id,).toBe(USER,);
  });
});

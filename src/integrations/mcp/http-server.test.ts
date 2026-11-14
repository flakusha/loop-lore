// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/integrations/mcp/http-server.test.ts — the MCP Streamable HTTP
 * transport exercised through the ACTUAL Elysia plugin via app.handle (bare
 * app + derive standing in for the auth middleware).
 *
 * Pinned here (the spec's HTTP rules + the auth seam):
 *  - initialize mints an unguessable session id, fresh per session;
 *  - tools/list + tools/call answer over HTTP;
 *  - a POST that does not accept BOTH application/json and
 *    text/event-stream is refused (406);
 *  - a request without the session id (400) or with an unknown one (404) is
 *    refused;
 *  - an unsupported MCP-Protocol-Version is refused (400);
 *  - a foreign Origin is refused (403);
 *  - an unauthenticated request is refused (401) and NO op runs;
 *  - a session belongs to the principal that opened it (403 otherwise);
 *  - GET opens the SSE stream, DELETE terminates the session.
 *
 * Resource contract (parallel-safe): ONE `:memory:` SQLite per test and
 * unique principals per test — the governance budget bucket is
 * process-global and keyed on the principal id.
 */

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import type { DB, } from "../../db/schema";
import { principalKind, } from "../../middleware/principal-kind";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { resetFacadeRegistry, } from "../loop-lore-facade/instance";
import { createMcpHttpRoutes, } from "./http-server";

const PREFIX = "/api/v1";
const ENDPOINT = `${PREFIX}/integrations/mcp/streamable`;
const ACCEPT = "application/json, text/event-stream";

let testDb: TestDb;
let db: Kysely<DB>;
let config: Config;
let idCounter = 0;
let principalId = "";
let otherPrincipalId = "";
let chatId = "";

beforeEach(async () => {
  const tag = `h${++idCounter}`;
  principalId = `mcp-stream-user-${tag}`;
  otherPrincipalId = `mcp-stream-other-${tag}`;
  chatId = `mcp-stream-chat-${tag}`;

  testDb = await createTestDb();
  db = testDb.db;
  config = createConfigSchema().defaults as unknown as Config;
  resetFacadeRegistry();

  await insertUsers(db, principalId, "MCP Stream User", { id: principalId, },);
  await insertActors(db, "MCP Stream User", {
    id: principalId,
    user_id: principalId,
    owner_id: principalId,
  },);

  await insertChats(db, "mcp-stream-chat", principalId, { id: chatId, },);
  await insertChatParticipants(db, chatId, principalId, { role_in_chat: "owner", },);
  await insertMessages(db, chatId, principalId, "user", "hello stream",);
},);

afterEach(async () => {
  resetFacadeRegistry();
  await destroyTestDb(testDb,);
},);

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

/** The spec-mandated initialize params (capabilities + clientInfo required). */
const INIT_PARAMS = {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "probe", version: "0", },
};

/** The caller identity the derive hands to the plugin (mutable per test). */
interface Caller {
  userId: string | null;
}

function makeApp(caller: Caller, requestId = "req-mcp-stream",): Elysia {
  resetFacadeRegistry();
  const app = new Elysia({ name: "test-mcp-http", },);
  // The route ctx REQUIRES the kind (fail-closed seam) — the test derive
  // names the user shape it stands in for.
  app.derive(() => ({
    userId: caller.userId,
    userRole: caller.userId === null ? null : "user",
    sessionId: null,
    principalKind: principalKind("user",),
    requestId,
  }));

  return app.use(createMcpHttpRoutes({ database: db, config, }, PREFIX,),);
}

function rpc(body: unknown, headers: Record<string, string> = {},): Request {
  return new Request(`http://localhost${ENDPOINT}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: ACCEPT, ...headers, },
    body: JSON.stringify(body,),
  },);
}

async function initialize(app: Elysia,): Promise<string> {
  const res = await app.handle(rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: INIT_PARAMS, },),);
  const sessionId = res.headers.get("mcp-session-id",);
  expect(res.status,).toBe(200,);
  expect(sessionId,).not.toBeNull();
  return sessionId as string;
}

describe("MCP Streamable HTTP transport", () => {
  test("initialize mints an unguessable session id", async () => {
    const res = await makeApp({ userId: principalId, },).handle(
      rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: INIT_PARAMS, },),
    );

    expect(res.status,).toBe(200,);
    const sessionId = res.headers.get("mcp-session-id",);
    expect(sessionId,).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
    );

    const envelope = await res.json() as Envelope;
    expect((envelope.result as { protocolVersion?: string }).protocolVersion,).toBe("2025-06-18",);
  });

  test("every session gets a FRESH session id", async () => {
    const app = makeApp({ userId: principalId, },);

    // The two initializes are INDEPENDENT (each mints its own transport,
    // server graph and session), so they run concurrently - which also
    // exercises the session map under concurrent creation.
    const [first, second,] = await Promise.all([initialize(app,), initialize(app,),],);

    expect(first,).not.toBe(second,);
  });

  test("tools/list answers the registry ops over HTTP", async () => {
    const app = makeApp({ userId: principalId, },);
    const sessionId = await initialize(app,);

    const res = await app.handle(
      rpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {}, }, { "mcp-session-id": sessionId, },),
    );

    expect(res.status,).toBe(200,);
    const envelope = await res.json() as Envelope;
    const tools = envelope.result?.tools as Array<{ name: string }>;
    expect(tools.map((tool,) => tool.name),).toContain("chat.history",);
  });

  test("tools/call runs the op and answers the tool result", async () => {
    const app = makeApp({ userId: principalId, },);
    const sessionId = await initialize(app,);

    const res = await app.handle(
      rpc(
        { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "chat.history", arguments: { chatId, }, }, },
        { "mcp-session-id": sessionId, },
      ),
    );

    expect(res.status,).toBe(200,);
    const envelope = await res.json() as Envelope;
    const result = envelope.result as unknown as HistoryResult;

    expect(result.isError,).toBeUndefined();
    expect(result.content[0]?.text,).toContain("hello stream",);
  });

  test("a POST that does not accept both content types is refused (406)", async () => {
    const res = await makeApp({ userId: principalId, },).handle(
      new Request(`http://localhost${ENDPOINT}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", },
        body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/list", params: {}, },),
      },),
    );

    expect(res.status,).toBe(406,);
  });

  test("a request without the session id is refused after one was issued (400)", async () => {
    const app = makeApp({ userId: principalId, },);
    await initialize(app,);

    const res = await app.handle(rpc({ jsonrpc: "2.0", id: 5, method: "tools/list", params: {}, },),);

    expect(res.status,).toBe(400,);
  });

  test("a request with an unknown session id is refused (404)", async () => {
    const res = await makeApp({ userId: principalId, },).handle(
      rpc({ jsonrpc: "2.0", id: 6, method: "tools/list", params: {}, }, { "mcp-session-id": crypto.randomUUID(), },),
    );

    expect(res.status,).toBe(404,);
  });

  test("an unsupported MCP-Protocol-Version is refused (400)", async () => {
    const app = makeApp({ userId: principalId, },);
    const sessionId = await initialize(app,);

    const res = await app.handle(
      rpc(
        { jsonrpc: "2.0", id: 7, method: "tools/list", params: {}, },
        { "mcp-session-id": sessionId, "mcp-protocol-version": "1999-01-01", },
      ),
    );

    expect(res.status,).toBe(400,);
  });

  test("a foreign Origin is refused (403)", async () => {
    const res = await makeApp({ userId: principalId, },).handle(
      rpc(
        { jsonrpc: "2.0", id: 8, method: "tools/list", params: {}, },
        { origin: "http://evil.example", },
      ),
    );

    expect(res.status,).toBe(403,);
  });

  test("an unauthenticated request is refused (401) and NO op runs", async () => {
    const res = await makeApp({ userId: null, },).handle(
      rpc(
        { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "chat.history", arguments: { chatId, }, }, },
      ),
    );

    expect(res.status,).toBe(401,);

    const rows = await db.selectFrom("log_entries",).selectAll()
      .where("event_type", "=", "facade.op",)
      .execute();

    expect(rows.length,).toBe(0,);
  });

  test("a session id of another principal is refused (403)", async () => {
    const caller: Caller = { userId: principalId, };
    const app = makeApp(caller,);
    const sessionId = await initialize(app,);

    caller.userId = otherPrincipalId;
    const res = await app.handle(
      rpc({ jsonrpc: "2.0", id: 10, method: "tools/list", params: {}, }, { "mcp-session-id": sessionId, },),
    );

    expect(res.status,).toBe(403,);
  });

  test("GET opens the session SSE stream", async () => {
    const app = makeApp({ userId: principalId, },);
    const sessionId = await initialize(app,);

    const res = await app.handle(
      new Request(`http://localhost${ENDPOINT}`, {
        headers: { accept: "text/event-stream", "mcp-session-id": sessionId, },
      },),
    );

    expect(res.status,).toBe(200,);
    expect(res.headers.get("content-type",),).toContain("text/event-stream",);
    await res.body?.cancel();
  });

  test("DELETE terminates the session", async () => {
    const app = makeApp({ userId: principalId, },);
    const sessionId = await initialize(app,);

    const deleted = await app.handle(
      new Request(`http://localhost${ENDPOINT}`, {
        method: "DELETE",
        headers: { accept: ACCEPT, "mcp-session-id": sessionId, },
      },),
    );

    expect(deleted.status,).toBe(200,);

    const after = await app.handle(
      rpc({ jsonrpc: "2.0", id: 11, method: "tools/list", params: {}, }, { "mcp-session-id": sessionId, },),
    );

    expect(after.status,).toBe(404,);
  });
});

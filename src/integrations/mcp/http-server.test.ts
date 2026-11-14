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
 *  - a foreign Origin is refused (403), and so is a rebinding request (the
 *    attacker controls the Host header too);
 *  - an absent Origin is allowed (a non-browser MCP client sends none);
 *  - the SSE keep-alive beats the server's idle timeout;
 *  - an unauthenticated request is refused (401) and NO op runs;
 *  - the request body cannot assert a principal;
 *  - a session belongs to the principal that opened it (403 otherwise);
 *  - an idle session is reaped (404) and a new connect evicts the CALLER's
 *    own oldest session, never another principal's;
 *  - the initialize response is not cacheable;
 *  - every refusal is one JSON-RPC error envelope;
 *  - GET opens the SSE stream, DELETE terminates the session.
 *
 * Resource contract (parallel-safe): ONE `:memory:` SQLite per test and
 * unique principals per test — the governance budget bucket is
 * process-global and keyed on the principal id.
 */

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { readFile, } from "node:fs/promises";
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
import {
  createMcpHttpRoutes,
  MAX_LIVE_SESSIONS,
  type McpHttpOptions,
  SERVER_IDLE_TIMEOUT_MS,
  SESSION_IDLE_TTL_MS,
  SSE_KEEP_ALIVE_MS,
} from "./http-server";

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
  const defaults = createConfigSchema().defaults;
  config = {
    ...defaults,
    // The DNS-rebinding allowlist is derived from THIS: the instance's own
    // public origin and the host it binds.
    server: { ...defaults.server, host: "localhost", port: 3000, publicOrigin: "http://localhost:3000", },
  } as unknown as Config;

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

function makeApp(caller: Caller, requestId = "req-mcp-stream", options: McpHttpOptions = {},): Elysia {
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

  return app.use(createMcpHttpRoutes({ database: db, config, }, { prefix: PREFIX, ...options, },),);
}

/** The Host header the app's own configuration allows. */
const HOST_HEADERS = { host: "localhost:3000", };

/**
 * The idle timeout the app's HTTP server actually applies, in ms: the value
 * its `serve()` call sets (Bun takes SECONDS) or Bun's own default when it
 * sets none. Read from the app's server source, so the SSE keep-alive is
 * checked against the REAL timeout and not against a mirrored constant.
 * @returns the effective idle timeout in ms (0 = the timeout is disabled)
 * @throws when the app sets an idle timeout this test cannot read
 */
async function appIdleTimeoutMs(): Promise<number> {
  const source = await readFile(new URL("../../server/start.ts", import.meta.url,), "utf8",);
  const start = source.indexOf("const httpServer = serve({",);
  const block = start === -1 ? "" : source.slice(start, source.indexOf("});", start,),);
  if (!block.includes("idleTimeout",)) { return SERVER_IDLE_TIMEOUT_MS; }

  const configured = /idleTimeout:\s*(\d+)/.exec(block,)?.[1];
  if (configured === undefined) {
    throw new Error("the app's idleTimeout is not a literal — extend this test to read it",);
  }

  return Number(configured,) * 1000;
}

function rpc(body: unknown, headers: Record<string, string> = {},): Request {
  return new Request(`http://localhost${ENDPOINT}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: ACCEPT, ...HOST_HEADERS, ...headers, },
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

  test("the live session set is bounded — the oldest session is evicted", async () => {
    const app = makeApp({ userId: principalId, },);

    // SEQUENTIAL on purpose: the assertion names the OLDEST session, so the
    // mint order must be deterministic (concurrent mints would interleave).
    const ids: string[] = [];
    for (let index = 0; index < MAX_LIVE_SESSIONS + 1; index += 1) {
      ids.push(await initialize(app,),);
    }

    const oldest = ids[0] as string;
    const newest = ids[ids.length - 1] as string;

    // The spec lets the server end a session at any time: the evicted id
    // answers 404 (the client's documented recovery is to re-initialize).
    const evicted = await app.handle(
      rpc({ jsonrpc: "2.0", id: 20, method: "tools/list", params: {}, }, { "mcp-session-id": oldest, },),
    );

    expect(evicted.status,).toBe(404,);

    const alive = await app.handle(
      rpc({ jsonrpc: "2.0", id: 21, method: "tools/list", params: {}, }, { "mcp-session-id": newest, },),
    );

    expect(alive.status,).toBe(200,);
  });

  test("a POST that does not accept both content types is refused (406)", async () => {
    const res = await makeApp({ userId: principalId, },).handle(
      new Request(`http://localhost${ENDPOINT}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", ...HOST_HEADERS, },
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
        headers: { accept: "text/event-stream", "mcp-session-id": sessionId, ...HOST_HEADERS, },
      },),
    );

    expect(res.status,).toBe(200,);
    expect(res.headers.get("content-type",),).toContain("text/event-stream",);

    // The stream is uncacheable AND untransformable — the SDK's own
    // `no-transform` directive survives the no-store marking (a proxy that
    // transforms an SSE stream breaks its framing).
    const cacheControl = res.headers.get("cache-control",) ?? "";
    expect(cacheControl,).toContain("no-store",);
    expect(cacheControl,).toContain("no-transform",);
    await res.body?.cancel();
  });

  test("DELETE terminates the session", async () => {
    const app = makeApp({ userId: principalId, },);
    const sessionId = await initialize(app,);

    const deleted = await app.handle(
      new Request(`http://localhost${ENDPOINT}`, {
        method: "DELETE",
        headers: { accept: ACCEPT, "mcp-session-id": sessionId, ...HOST_HEADERS, },
      },),
    );

    expect(deleted.status,).toBe(200,);

    const after = await app.handle(
      rpc({ jsonrpc: "2.0", id: 11, method: "tools/list", params: {}, }, { "mcp-session-id": sessionId, },),
    );

    expect(after.status,).toBe(404,);
  });

  test("the SSE keep-alive beats the server's effective idle timeout", async () => {
    // The keep-alive must fire BEFORE the idle timeout severs the GET SSE
    // stream — the repo's own SSE convention. The EFFECTIVE timeout is the
    // one the app's own server applies, so this reads that call instead of
    // trusting a mirrored constant: a shorter idle timeout there (or a
    // raised one) is caught here, not in production.
    const effective = await appIdleTimeoutMs();

    // 0 disables the timeout entirely — the stream can never be severed.
    expect(effective === 0 || SSE_KEEP_ALIVE_MS < effective,).toBe(true,);
  });

  test("a request without an Origin is allowed (a non-browser MCP client)", async () => {
    const app = makeApp({ userId: principalId, },);
    const sessionId = await initialize(app,);

    const res = await app.handle(
      rpc({ jsonrpc: "2.0", id: 30, method: "tools/list", params: {}, }, { "mcp-session-id": sessionId, },),
    );

    expect(res.status,).toBe(200,);
  });

  test("the instance's own Origin is allowed", async () => {
    const app = makeApp({ userId: principalId, },);
    const sessionId = await initialize(app,);

    const res = await app.handle(
      rpc(
        { jsonrpc: "2.0", id: 31, method: "tools/list", params: {}, },
        { "mcp-session-id": sessionId, origin: "http://localhost:3000", },
      ),
    );

    expect(res.status,).toBe(200,);
  });

  test("a rebinding request is refused (403) — the Host header is not the allowlist", async () => {
    // The attacker controls BOTH headers (its domain now resolves at the
    // victim), so a host-relative check passes. Only the app's own
    // allowlist refuses it.
    const res = await makeApp({ userId: principalId, },).handle(
      rpc(
        { jsonrpc: "2.0", id: 32, method: "tools/list", params: {}, },
        { origin: "http://evil.example", host: "evil.example", },
      ),
    );

    expect(res.status,).toBe(403,);
    expect(Object.keys(await res.json() as Record<string, unknown>,).sort(),).toEqual([
      "error",
      "id",
      "jsonrpc",
    ],);
  });

  test("a Host outside the allowlist is refused (403)", async () => {
    const res = await makeApp({ userId: principalId, },).handle(
      rpc(
        { jsonrpc: "2.0", id: 33, method: "tools/list", params: {}, },
        { host: "evil.example", },
      ),
    );

    expect(res.status,).toBe(403,);
  });

  test("an idle session is reaped and answers 404", async () => {
    let clock = 1_700_000_000_000;
    const app = makeApp({ userId: principalId, }, "req-mcp-stream", { now: () => clock, },);
    const sessionId = await initialize(app,);

    clock += SESSION_IDLE_TTL_MS + 1;

    const res = await app.handle(
      rpc({ jsonrpc: "2.0", id: 34, method: "tools/list", params: {}, }, { "mcp-session-id": sessionId, },),
    );

    expect(res.status,).toBe(404,);
  });

  test("a client that connects again evicts its OWN oldest session, not another principal's", async () => {
    const caller: Caller = { userId: principalId, };
    const app = makeApp(caller,);

    // Another principal's session, opened FIRST — under a global
    // insertion-order eviction this is the one that would die.
    caller.userId = otherPrincipalId;
    const foreign = await initialize(app,);

    // The calling principal fills the rest of the cap.
    caller.userId = principalId;
    const ids: string[] = [];
    for (let index = 0; index < MAX_LIVE_SESSIONS - 1; index += 1) {
      ids.push(await initialize(app,),);
    }

    // One more connect from the SAME principal: its own oldest session goes.
    await initialize(app,);

    const ownOldest = ids[0] as string;
    const evicted = await app.handle(
      rpc({ jsonrpc: "2.0", id: 35, method: "tools/list", params: {}, }, { "mcp-session-id": ownOldest, },),
    );

    expect(evicted.status,).toBe(404,);

    // The other principal's session survived — connecting is not a way to
    // push another client out.
    caller.userId = otherPrincipalId;
    const foreignAlive = await app.handle(
      rpc({ jsonrpc: "2.0", id: 36, method: "tools/list", params: {}, }, { "mcp-session-id": foreign, },),
    );

    expect(foreignAlive.status,).toBe(200,);
  });

  test("the request body cannot assert a principal", async () => {
    // If the body's principal-shaped fields were honoured, the op would run
    // as "attacker" (no chat access -> an error result). It must run as the
    // server-resolved principal.
    const app = makeApp({ userId: principalId, }, "req-mcp-adv",);
    const sessionId = await initialize(app,);

    const res = await app.handle(
      rpc(
        {
          jsonrpc: "2.0",
          id: 37,
          method: "tools/call",
          params: { name: "chat.history", arguments: { chatId, userId: "attacker", userRole: "admin", }, },
        },
        { "mcp-session-id": sessionId, },
      ),
    );

    expect(res.status,).toBe(200,);
    const envelope = await res.json() as Envelope;
    const result = envelope.result as unknown as HistoryResult;

    expect(result.isError,).toBeUndefined();
    expect(result.content[0]?.text,).toContain("hello stream",);

    const row = await db.selectFrom("log_entries",).selectAll()
      .where("event_type", "=", "facade.op",)
      .where("request_id", "=", "req-mcp-adv",)
      .executeTakeFirst();

    expect(row?.user_id,).toBe(principalId,);
  });

  test("the initialize response is not cacheable", async () => {
    const res = await makeApp({ userId: principalId, },).handle(
      rpc({ jsonrpc: "2.0", id: 38, method: "initialize", params: INIT_PARAMS, },),
    );

    expect(res.status,).toBe(200,);
    expect(res.headers.get("mcp-session-id",),).not.toBeNull();
    expect(res.headers.get("cache-control",),).toBe("no-store",);
  });

  test("every refusal on this endpoint is one JSON-RPC error envelope", async () => {
    const app = makeApp({ userId: principalId, },);

    const unknown = await app.handle(
      rpc(
        { jsonrpc: "2.0", id: 39, method: "tools/list", params: {}, },
        { "mcp-session-id": crypto.randomUUID(), },
      ),
    );

    expect(unknown.status,).toBe(404,);
    expect(Object.keys(await unknown.json() as Record<string, unknown>,).sort(),).toEqual([
      "error",
      "id",
      "jsonrpc",
    ],);

    const unauthenticated = await makeApp({ userId: null, },).handle(
      rpc({ jsonrpc: "2.0", id: 40, method: "tools/list", params: {}, },),
    );

    expect(unauthenticated.status,).toBe(401,);
    expect(Object.keys(await unauthenticated.json() as Record<string, unknown>,).sort(),).toEqual([
      "error",
      "id",
      "jsonrpc",
    ],);
  });
});

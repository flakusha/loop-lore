// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * scoped-agent.test.ts — the agentic surface driven by REAL integration
 * tokens (TASK-agentic-integration-tests).
 *
 * The delivered seam mints scoped credentials (`llri_` bearers) that the auth
 * middleware resolves into an `external-agent` principal; the facade then
 * enforces the scope ladder, the per-op ownership check, the governance
 * budget, and the audit row. This file drives that chain END TO END — real
 * token rows, the real auth middleware, the real facade ops over the real
 * services — over BOTH agentic transports:
 *
 *  - the MCP JSON-RPC transport (`POST /api/v1/integrations/mcp`): a refused
 *    op answers `isError` content carrying the facade's 403-class body;
 *  - the facade REST op route (`POST /api/v1/integrations/:opName`): the
 *    same refusal answers a LITERAL 403 status.
 *
 * AC2 (unauthorized ops denied with 403-class results) and AC3 (scope
 * enforcement, ownership, rate limit, audit) are asserted against behaviour
 * that exists; nothing here mocks the seam it exercises.
 *
 * Resource contract (parallel-safe): one :memory: SQLite per file
 * (createTestDb), no ports, no env, no sleeps; the budget test uses its own
 * token, so it drains only its own bucket; every call carries a unique
 * request id so the audit row it writes is addressable.
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../../config/schema";
import { createConfigSchema, } from "../../../config/schema-class";
import { IntegrationTokenScope, } from "../../../db/enums-core/integration-tokens";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { authenticateRequest, } from "../../../middleware/auth";
import { mintIntegrationToken, } from "../../../middleware/auth/integration-token";
import { requireAuthGuard, } from "../../../middleware/require-auth-guard";
import { createTestDb, destroyTestDb, type TestDb, } from "../../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertIntegrationTokens,
  insertMessages,
  insertUsers,
} from "../../../test-utils/insert-helpers";
import { resetFacadeRegistry, } from "../instance";
import { createFacadeRoutes, } from "../routes";
import { createMcpRoutes, } from "./routes";

/** The admin who minted every token (the tokens' subject binding). */
const ISSUER = "agentic-issuer";
/** A chat the issuer owns — the only chat a token may touch. */
const CHAT = "agentic-chat-1";
/** A chat owned by somebody else — the per-op ownership check must refuse it. */
const FOREIGN_CHAT = "agentic-chat-foreign";
/** The foreign chat's owner. */
const STRANGER = "agentic-stranger";
const PREFIX = "/api/v1";

let testDb: TestDb;
let db: Kysely<DB>;
let config: Config;

/** Raw bearers keyed by the scope they were minted with. */
const tokens: Record<string, string> = {};

beforeAll(async () => {
  createLogger({ level: "error", },);
  testDb = await createTestDb();
  db = testDb.db;
  config = createConfigSchema().defaults as unknown as Config;

  await insertUsers(db, ISSUER, "Agentic Issuer", { id: ISSUER, },);
  await insertActors(db, "Agentic Issuer", { id: ISSUER, user_id: ISSUER, owner_id: ISSUER, },);
  await insertChats(db, "agentic-chat", ISSUER, { id: CHAT, },);
  await insertChatParticipants(db, CHAT, ISSUER, { role_in_chat: "owner", },);
  await insertMessages(db, CHAT, ISSUER, "user", "hello agent",);

  await insertUsers(db, STRANGER, "Stranger", { id: STRANGER, },);
  await insertActors(db, "Stranger", { id: STRANGER, user_id: STRANGER, owner_id: STRANGER, },);
  await insertChats(db, "agentic-foreign", STRANGER, { id: FOREIGN_CHAT, },);
  await insertChatParticipants(db, FOREIGN_CHAT, STRANGER, { role_in_chat: "owner", },);

  for (const scope of [IntegrationTokenScope.Read, IntegrationTokenScope.ChatWrite,]) {
    const { raw, hash, } = mintIntegrationToken();
    await insertIntegrationTokens(db, `agentic-${scope}`, hash, scope, ISSUER,);
    tokens[scope] = raw;
  }
},);

afterAll(async () => {
  resetFacadeRegistry();
  await destroyTestDb(testDb,);
},);

/**
 * The agentic app: the REAL auth chain (integration-token seam → principal)
 * plus the REAL central guard, with both agentic transports mounted.
 */
function makeApp(): Elysia {
  resetFacadeRegistry();
  const app = new Elysia({ name: "test-agentic-scoped", },);

  app.derive(async ({ request, },) => {
    const result = await authenticateRequest({ request, database: db, authConfig: config.auth, },);

    if (result instanceof Response) {
      return {
        userId: null,
        userRole: null,
        sessionId: null,
        principalKind: "user" as const,
        credentialId: null,
        credentialName: null,
        credentialScope: null,
        requestId: request.headers.get("x-request-id",) ?? "",
      };
    }

    const rc = result.context;
    return {
      userId: rc.userId,
      userRole: rc.userRole,
      sessionId: rc.sessionId,
      principalKind: rc.principalKind,
      credentialId: rc.credentialId,
      credentialName: rc.credentialName,
      credentialScope: rc.credentialScope,
      requestId: request.headers.get("x-request-id",) ?? "",
    };
  },);

  app.onBeforeHandle(requireAuthGuard,);
  // A general-API route: the token principals must never reach it.
  app.get(`${PREFIX}/chats`, () => new Response("general api",),);

  app.use(createMcpRoutes({ database: db, config, }, PREFIX,),);
  app.use(createFacadeRoutes({ database: db, config, }, PREFIX,),);

  return app;
}

/** One MCP JSON-RPC request carrying a token bearer. */
function mcpRequest(
  token: string,
  method: string,
  params: unknown,
  id: number,
  requestId: string,
): Request {
  return new Request(`http://localhost${PREFIX}/integrations/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "x-request-id": requestId,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params, },),
  },);
}

/** One facade REST op call carrying a token bearer. */
function restRequest(
  token: string,
  opName: string,
  body: unknown,
  requestId: string,
): Request {
  return new Request(`http://localhost${PREFIX}/integrations/${opName}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "x-request-id": requestId,
    },
    body: JSON.stringify(body,),
  },);
}

/** The MCP tool-call result shape. */
interface ToolResult {
  content: Array<{ type: string; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/** The parsed JSON body of a facade answer. */
interface FacadeBody {
  error?: string;
  message?: string;
  id?: string;
  data?: Array<{ content?: string }>;
}

describe("agentic surface — scoped integration tokens", () => {
  test("AC2/AC3: a read-only token is refused the write op over MCP (403-class body)", async () => {
    const app = makeApp();
    const res = await app.handle(
      mcpRequest(
        tokens.read ?? "",
        "tools/call",
        { name: "chat.send", arguments: { chatId: CHAT, content: "denied", }, },
        1,
        "req-read-write",
      ),
    );

    expect(res.status,).toBe(200,);

    const envelope = await res.json() as { result?: ToolResult };
    const result = envelope.result as ToolResult;
    expect(result.isError,).toBe(true,);

    const body = JSON.parse(result.content[0]?.text ?? "null",) as FacadeBody;
    expect(body.error,).toBe("forbidden",);
    expect(body.message,).toContain("chat-write",);

    // The refused op never reached the service: no message landed.
    const rows = await db.selectFrom("messages",).selectAll().where("content", "=", "denied",).execute();
    expect(rows,).toHaveLength(0,);
  });

  test("AC2: the same refusal answers a LITERAL 403 on the facade REST route", async () => {
    const app = makeApp();
    const res = await app.handle(
      restRequest(tokens.read ?? "", "chat.send", { chatId: CHAT, content: "denied", }, "req-read-rest",),
    );

    expect(res.status,).toBe(403,);

    const body = await res.json() as FacadeBody;
    expect(body.error,).toBe("forbidden",);
    expect(body.message,).toContain("chat-write",);
  });

  test("AC3: a chat-write token may write, and the call is audited with its token attribution", async () => {
    const app = makeApp();
    const res = await app.handle(
      mcpRequest(
        tokens["chat-write"] ?? "",
        "tools/call",
        { name: "chat.send", arguments: { chatId: CHAT, content: "written by agent", }, },
        2,
        "req-write-ok",
      ),
    );

    expect(res.status,).toBe(200,);

    const envelope = await res.json() as { result?: ToolResult };
    const result = envelope.result as ToolResult;
    expect(result.isError,).toBeUndefined();

    const rows = await db.selectFrom("messages",).selectAll().where("content", "=", "written by agent",).execute();
    expect(rows,).toHaveLength(1,);

    const audit = await db.selectFrom("log_entries",).selectAll()
      .where("event_type", "=", "facade.op",)
      .where("request_id", "=", "req-write-ok",)
      .executeTakeFirst();

    expect(audit,).toBeDefined();
    expect(audit?.action,).toBe("chat.send",);
    // The subject binding attributes the call to the issuing admin.
    expect(audit?.user_id,).toBe(ISSUER,);

    const meta = JSON.parse(audit?.meta ?? "{}",) as {
      tokenScope?: string;
      principalKind?: string;
      status?: number;
    };

    expect(meta.principalKind,).toBe("external-agent",);
    expect(meta.tokenScope,).toBe("chat-write",);
    expect(meta.status,).toBe(201,);
  });

  test("AC3: the read tier still reaches the read op over MCP", async () => {
    const app = makeApp();
    const res = await app.handle(
      mcpRequest(
        tokens.read ?? "",
        "tools/call",
        { name: "chat.history", arguments: { chatId: CHAT, }, },
        3,
        "req-read-ok",
      ),
    );

    expect(res.status,).toBe(200,);

    const envelope = await res.json() as { result?: ToolResult };
    const result = envelope.result as ToolResult;
    expect(result.isError,).toBeUndefined();

    const body = JSON.parse(result.content[0]?.text ?? "null",) as FacadeBody;
    expect(body.data?.some((m,) => m.content === "hello agent"),).toBe(true,);
  });

  test("AC3: ownership — a token may not touch a chat its subject does not own", async () => {
    const app = makeApp();
    const res = await app.handle(
      mcpRequest(
        tokens["chat-write"] ?? "",
        "tools/call",
        { name: "chat.history", arguments: { chatId: FOREIGN_CHAT, }, },
        4,
        "req-foreign",
      ),
    );

    expect(res.status,).toBe(200,);

    const envelope = await res.json() as { result?: ToolResult };
    const result = envelope.result as ToolResult;
    expect(result.isError,).toBe(true,);
  });

  test("AC2: an unknown token never reaches the agentic surface", async () => {
    const app = makeApp();
    const res = await app.handle(
      mcpRequest(
        "llri_not-a-real-token",
        "tools/call",
        { name: "chat.history", arguments: { chatId: CHAT, }, },
        5,
        "req-unknown",
      ),
    );

    expect(res.status,).toBe(401,);
  });

  test("AC2: a token principal is confined — the general API refuses it", async () => {
    const app = makeApp();
    const res = await app.handle(
      new Request(`http://localhost${PREFIX}/chats`, {
        headers: { authorization: `Bearer ${tokens.read ?? ""}`, },
      },),
    );

    expect(res.status,).toBe(401,);
  });

  test("AC3: the governance budget answers 429 once the token's bucket is drained", async () => {
    const app = makeApp();
    let sawLimit = false;

    // chatPolicy: 60s window, burst 50 — the bucket drains within the burst.
    for (let i = 0; i < 90 && !sawLimit; i++) {
      const res = await app.handle(
        mcpRequest(
          tokens["chat-write"] ?? "",
          "tools/call",
          { name: "chat.history", arguments: { chatId: "agentic-no-such-chat", }, },
          100 + i,
          `req-budget-${i}`,
        ),
      );

      if (res.status === 200) {
        const envelope = await res.json() as { result?: ToolResult };
        const body = JSON.parse(envelope.result?.content[0]?.text ?? "null",) as FacadeBody;
        if (body.error === "rate_limited") {
          sawLimit = true;
          expect(body.message,).toContain("chat.history",);
        }
      }
    }

    expect(sawLimit,).toBe(true,);
  });
});

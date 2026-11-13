// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/loop-lore-facade/routes.test.ts — the facade REST surface
// exercised through the ACTUAL Elysia plugin via app.handle (derive = auth).
//
// Covers the HTTP wiring acceptance surfaces: manifest auth + descriptor
// shape; POST identity from the derived context (adversarial body inert);
// unknown op -> 404; 429 passthrough; hostile inputs stay data; row-level
// foreign-chat denial; a real chat.history roundtrip over the real services.
//
// Resource contract (parallel-safe): ONE :memory: SQLite PER TEST (created in
// beforeEach, destroyed in afterEach) and unique principals per test — the
// governance budget bucket is process-global and keyed by the principal's
// user id, so a shared id would let one test drain a sibling's budget.
// No ports, no env, no sleeps.

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
import { resetFacadeRegistry, } from "./instance";
import { createFacadeRoutes, } from "./routes";

const PREFIX = "/api/v1";

let testDb: TestDb;
let db: Kysely<DB>;
let config: Config;
let idCounter = 0;
/** Principals — unique per test (see the resource contract above). */
let principalId = "";
let otherPrincipalId = "";
let ratePrincipalId = "";
let chatId = "";
let otherChatId = "";

beforeEach(async () => {
  const tag = `f${++idCounter}`;
  principalId = `facade-http-user-${tag}`;
  otherPrincipalId = `facade-http-other-user-${tag}`;
  ratePrincipalId = `facade-http-rate-user-${tag}`;
  chatId = `facade-http-chat-${tag}`;
  otherChatId = `facade-http-chat-other-${tag}`;

  testDb = await createTestDb();
  db = testDb.db;
  // Real schema defaults: the chat.send pipeline reads config.generation.
  config = createConfigSchema().defaults as unknown as Config;

  await insertUsers(db, principalId, "Facade HTTP User", { id: principalId, },);
  await insertUsers(db, otherPrincipalId, "Facade HTTP Other", { id: otherPrincipalId, },);
  await insertUsers(db, ratePrincipalId, "Facade HTTP Rate User", { id: ratePrincipalId, },);
  await insertActors(db, "Facade HTTP User", {
    id: principalId,
    user_id: principalId,
    owner_id: principalId,
  },);

  await insertChats(db, "facade-http-chat", principalId, { id: chatId, },);
  await insertChatParticipants(db, chatId, principalId, { role_in_chat: "owner", },);
  await insertActors(db, "Facade HTTP Other", {
    id: otherPrincipalId,
    user_id: otherPrincipalId,
    owner_id: otherPrincipalId,
  },);

  await insertChats(db, "facade-http-chat-other", otherPrincipalId, { id: otherChatId, },);
  await insertChatParticipants(db, otherChatId, otherPrincipalId, { role_in_chat: "owner", },);
  await insertMessages(db, chatId, principalId, "user", "hello agent",);
},);

afterEach(async () => {
  resetFacadeRegistry();
  await destroyTestDb(testDb,);
},);

/**
 * Bare Elysia app whose derive stands in for the auth middleware, mounting
 * the REAL facade plugin. The registry singleton is reset first so its ops
 * re-bind to THIS file's :memory: database.
 * @param userId - the authenticated principal (null = anonymous)
 * @param requestId - request-id middleware output
 * @returns the mounted app
 */
function makeApp(userId: string | null, requestId = "req-http-test",): Elysia {
  resetFacadeRegistry();
  const app = new Elysia({ name: "test-facade-routes", },);
  app.derive(() => ({
    userId,
    userRole: userId === null ? null : "user",
    sessionId: null,
    // The route ctx REQUIRES the kind (fail-closed seam) — the test derive
    // names the user shape it stands in for.
    principalKind: principalKind("user",),
    requestId,
  }));

  return app.use(createFacadeRoutes({ database: db, config, }, PREFIX,),);
}

function post(app: Elysia, opName: string, body: unknown,): Promise<Response> {
  return app.handle(
    new Request(`http://localhost${PREFIX}/integrations/${opName}`, {
      method: "POST",
      headers: { "content-type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
}

async function auditRowFor(requestId: string,) {
  return await db
    .selectFrom("log_entries",)
    .selectAll()
    .where("event_type", "=", "facade.op",)
    .where("request_id", "=", requestId,)
    .executeTakeFirst();
}

describe("facade REST surface", () => {
  test("manifest requires an authenticated principal (no anonymous discovery)", async () => {
    const res = await makeApp(null,).handle(
      new Request(`http://localhost${PREFIX}/integrations/manifest`,),
    );

    expect(res.status,).toBe(401,);
  });

  test("manifest serves bare descriptors to any authenticated user", async () => {
    const res = await makeApp(principalId,).handle(
      new Request(`http://localhost${PREFIX}/integrations/manifest`,),
    );

    expect(res.status,).toBe(200,);

    const manifest = await res.json() as Array<Record<string, unknown>>;
    const names = manifest.map((entry,) => entry.name);
    expect(names,).toContain("chat.send",);
    expect(names,).toContain("chat.history",);
    expect(names,).toContain("generation.generate",);

    // Descriptors only — no handler internals, no schemas leak.
    for (const entry of manifest) {
      expect(Object.keys(entry,).sort(),).toEqual(
        ["description", "domain", "name", "scope", "summary",],
      );
    }
  });

  test("unknown op is a typed 404", async () => {
    const res = await post(makeApp(principalId,), "no.such-op", {},);
    expect(res.status,).toBe(404,);
    const body = await res.json() as { error: string };
    expect(body.error,).toBe("unknown_facade_op",);
  });

  test("chat.history roundtrips over HTTP against the real services", async () => {
    const res = await post(makeApp(principalId,), "chat.history", { chatId, },);
    expect(res.status,).toBe(200,);

    const body = await res.json() as { data: Array<{ content: string }> };
    expect(body.data.some((m,) => m.content === "hello agent"),).toBe(true,);
  });

  test("POST identity comes from the context; adversarial body principal is inert", async () => {
    // If the body's principal-shaped fields were trusted, the op would run
    // as "attacker" (no chat access -> 404). It must run as the context
    // principal -> 200.
    const res = await post(makeApp(principalId, "req-adv-1",), "chat.history", {
      chatId,
      userId: "attacker",
      userRole: "admin",
    },);

    expect(res.status,).toBe(200,);

    // The audit row attributes the call to the CONTEXT principal and the
    // context request id — the body fields never reached the facade context.
    const row = await auditRowFor("req-adv-1",);
    expect(row,).toBeDefined();
    expect(row?.user_id,).toBe(principalId,);
    expect(row?.action,).toBe("chat.history",);
  });

  test("foreign chat reads and writes fail closed at the facade (row-level authz)", async () => {
    // Row-level: the caller must not read or write another principal's chat.
    // The verdict is the access seam's not-found-or-not-owner 404 — identity
    // comes from the context, so no body field can widen the caller's reach.
    const read = await post(makeApp(principalId,), "chat.history", { chatId: otherChatId, },);
    expect(read.status,).toBe(404,);

    const write = await post(makeApp(principalId,), "chat.send", {
      chatId: otherChatId,
      content: "should never land",
    },);

    expect(write.status,).toBe(404,);

    // And nothing leaked: the denied send wrote no message row.
    const leaked = await db
      .selectFrom("messages",)
      .selectAll()
      .where("chat_id", "=", otherChatId,)
      .execute();

    expect(leaked,).toHaveLength(0,);
  });

  test("SQL metacharacters in facade inputs are data, never interpreted", async () => {
    // Every input reaches SQLite only as a bound Kysely parameter against a
    // constant column name — hostile metacharacters must round-trip as DATA.
    const payload = "'; DROP TABLE messages;-- ' OR '1'='1";

    const send = await post(makeApp(principalId,), "chat.send", {
      chatId,
      content: payload,
    },);

    expect(send.status,).toBe(201,);
    const sendBody = await send.json() as { id: unknown };
    expect(typeof sendBody.id,).toBe("string",);

    const hist = await post(makeApp(principalId,), "chat.history", { chatId, },);
    expect(hist.status,).toBe(200,);
    const histBody = await hist.json() as { data: Array<{ content: string }> };
    expect(histBody.data.some((m,) => m.content === payload),).toBe(true,);

    const hostileId = await post(makeApp(principalId,), "chat.send", {
      chatId: "x'; DROP TABLE messages;--",
      content: "hi",
    },);

    expect(hostileId.status,).toBe(404,);

    const hostileQuery = await post(makeApp(principalId,), "chat.history", {
      chatId,
      parentId: "' OR '1'='1' --",
      translateLocale: "en'; DROP TABLE messages;--",
    },);

    expect(hostileQuery.status,).toBe(200,);
  });

  test("governance budget exhaustion passes 429 through", async () => {
    const app = makeApp(ratePrincipalId,);
    let sawLimit = false;
    // chatPolicy: 60s window, burst 50 — ~51 cheap unknown-chat calls drain
    // the bucket; the cap keeps the loop bounded if the window was warmed.
    for (let i = 0; i < 80 && !sawLimit; i++) {
      const res = await post(app, "chat.history", { chatId: "facade-http-nope", },);
      if (res.status === 429) {
        sawLimit = true;
        const body = await res.json() as { error: string };
        expect(body.error,).toBe("rate_limited",);
      } else {
        expect(res.status,).toBe(404,);
      }
    }

    expect(sawLimit,).toBe(true,);
  });
});

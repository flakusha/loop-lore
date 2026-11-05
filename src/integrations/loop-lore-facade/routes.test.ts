// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/loop-lore-facade/routes.test.ts — the facade REST surface
// exercised through the ACTUAL Elysia plugin (app.handle, sibling-route-test
// style: bare app + derive standing in for the auth middleware).
//
// Covers the HTTP wiring acceptance surfaces:
//  - manifest requires an authenticated principal; any user may read it;
//  - POST identity comes from the derived context — an adversarial
//    principal-shaped body is inert (trust boundary, HTTP layer);
//  - unknown op -> 404;  governance budget exhaustion -> 429 passthrough;
//  - a real chat.history roundtrip over the real services.
//
// Resource contract (parallel-safe): one :memory: SQLite per file via
// createTestDb, no ports, no env, no sleeps; the rate test keys its budget
// on a dedicated user id so it cannot drain a sibling test's budget.

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
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

const USER = "facade-http-user";
const RATE = "facade-http-rate-user";
const CHAT = "facade-http-chat-1";
const PREFIX = "/api/v1";

let testDb: TestDb;
let db: Kysely<DB>;
let config: Config;

beforeAll(async () => {
  createLogger({ level: "error", },);
  testDb = await createTestDb();
  db = testDb.db;
  config = {} as Config;

  await insertUsers(db, USER, "Facade HTTP User", { id: USER, },);
  await insertUsers(db, RATE, "Facade HTTP Rate User", { id: RATE, },);
  await insertActors(db, "Facade HTTP User", { id: USER, user_id: USER, owner_id: USER, },);
  await insertChats(db, "facade-http-chat", USER, { id: CHAT, },);
  await insertChatParticipants(db, CHAT, USER, { role_in_chat: "owner", },);
  await insertMessages(db, CHAT, USER, "user", "hello agent",);
},);

afterAll(async () => {
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
    const res = await makeApp(USER,).handle(
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
    const res = await post(makeApp(USER,), "no.such-op", {},);
    expect(res.status,).toBe(404,);
    const body = await res.json() as { error: string };
    expect(body.error,).toBe("unknown_facade_op",);
  });

  test("chat.history roundtrips over HTTP against the real services", async () => {
    const res = await post(makeApp(USER,), "chat.history", { chatId: CHAT, },);
    expect(res.status,).toBe(200,);

    const body = await res.json() as { data: Array<{ content: string }> };
    expect(body.data.some((m,) => m.content === "hello agent"),).toBe(true,);
  });

  test("POST identity comes from the context; adversarial body principal is inert", async () => {
    // If the body's principal-shaped fields were trusted, the op would run
    // as "attacker" (no chat access -> 404). It must run as USER -> 200.
    const res = await post(makeApp(USER, "req-adv-1",), "chat.history", {
      chatId: CHAT,
      userId: "attacker",
      userRole: "admin",
    },);

    expect(res.status,).toBe(200,);

    // The audit row attributes the call to the CONTEXT principal and the
    // context request id — the body fields never reached the facade context.
    const row = await auditRowFor("req-adv-1",);
    expect(row,).toBeDefined();
    expect(row?.user_id,).toBe(USER,);
    expect(row?.action,).toBe("chat.history",);
  });

  test("governance budget exhaustion passes 429 through", async () => {
    const app = makeApp(RATE,);
    let sawLimit = false;
    // chatPolicy: 60s window, burst 50 — ~51 cheap unknown-chat calls drain
    // the bucket; the cap keeps the loop bounded even if a sibling process
    // already warmed this key's window.
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

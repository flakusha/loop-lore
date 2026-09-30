// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for POST /api/chats/:id/turn-skip
 * (TASK-turn-skip-event-and-persistence).
 *
 * Translates RecordTurnSkipResult -> HTTP: not_found -> 404,
 * refused_beat -> 409, forbidden -> 403. Per-user+chat rate limit -> 429.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import type { DB, } from "../../db/schema";
import type { AutoGenOpts, } from "../../generation/auto-gen";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { turnSkipRoutes, } from "./turn-skip-routes";

// Spy the auto-generation trigger: the route must fire it at most once per
// advance, and never for a deduped (replayed) advance.
//
// Injected through HandlerOpts, not `mock.module`d. Bun's module registry is
// process-global and `mock.module` has no unmock, so the stub reached every later
// file importing this hub — src/routes/messages/reply.ts took its generation
// branch and returned replied:false, failing
// src/routes/messages/reply-encrypted.test.ts. Re-registering the real module in
// afterAll did not help: reply.ts had already bound the stubbed exports by then.
const triggerCalls: AutoGenOpts[] = [];

describe("chats turn-skip-routes", () => {
  let db: Kysely<DB>;
  const OWNER_ID = crypto.randomUUID();
  const CHAT_ID = crypto.randomUUID();

  function makeApp(userId: string | undefined,) {
    const config = createConfigSchema().defaults as Config;
    return new Elysia({ name: "test-app", },)
      .derive(() => ({ userId, userRole: "user" as string | null, }))
      .use(turnSkipRoutes({
        database: db,
        config,
        // Forced true: the route only fires the trigger when LLM generation is
        // configured, and the harness config has none.
        isLlmGenerationConfigured: () => true,
        triggerAutoGeneration: (input: AutoGenOpts,) => {
          triggerCalls.push(input,);
          return Promise.resolve();
        },
      }, "/api",),);
  }

  beforeEach(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: OWNER_ID, } as never,);
    await insertActors(db, "Owner", { id: OWNER_ID, user_id: OWNER_ID, owner_id: OWNER_ID, } as never,);
    await insertChats(db, "Skip Route Chat", OWNER_ID, { id: CHAT_ID, } as never,);
    await insertChatParticipants(db, CHAT_ID, OWNER_ID, { role_in_chat: "owner", },);
  },);

  afterEach(async () => {
    await db.destroy();
  },);

  test("POST turn-skip: participant records a hold skip", async () => {
    const app = makeApp(OWNER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/turn-skip`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ mode: "hold", reason: "thinking", },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { ok: boolean; mode: string; deduped: boolean };
    expect(body.ok,).toBe(true,);
    expect(body.mode,).toBe("hold",);
    expect(body.deduped,).toBe(false,);
  });

  test("POST turn-skip: unknown chat -> 404", async () => {
    const app = makeApp(OWNER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${crypto.randomUUID()}/turn-skip`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ mode: "hold", },),
      },),
    );
    expect(res.status,).toBe(404,);
  });

  test("POST turn-skip: unauthenticated -> 401", async () => {
    const app = makeApp(undefined,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/turn-skip`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ mode: "hold", },),
      },),
    );
    expect(res.status,).toBe(401,);
  });

  test("POST turn-skip: per-user+chat rate limit -> 429", async () => {
    const app = makeApp(OWNER_ID,);
    const rateChatId = crypto.randomUUID();
    let last = 0;
    for (let i = 0; i < 11; i++) {
      const res = await app.handle(
        new Request(`http://localhost/api/chats/${rateChatId}/turn-skip`, {
          method: "POST",
          headers: { "content-type": "application/json", },
          body: JSON.stringify({ mode: "hold", },),
        },),
      );
      last = res.status;
    }
    expect(last,).toBe(429,);
  });

  test("POST turn-skip: deduped advance does not re-trigger generation", async () => {
    const app = makeApp(OWNER_ID,);
    const makeReq = () =>
      new Request(`http://localhost/api/chats/${CHAT_ID}/turn-skip`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ mode: "advance", },),
      },);

    const first = await app.handle(makeReq(),);
    expect(first.status,).toBe(200,);
    const firstBody = await first.json() as { deduped: boolean };
    expect(firstBody.deduped,).toBe(false,);
    expect(triggerCalls.length,).toBe(1,);

    // Same actor + chat + mode within the dedup bucket replays the row.
    const second = await app.handle(makeReq(),);
    expect(second.status,).toBe(200,);
    const secondBody = await second.json() as { deduped: boolean };
    expect(secondBody.deduped,).toBe(true,);
    // No second generation beat for the replayed advance.
    expect(triggerCalls.length,).toBe(1,);
  });
});

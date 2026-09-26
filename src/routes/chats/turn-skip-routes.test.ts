// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for POST /api/chats/:id/turn-skip
 * (TASK-turn-skip-event-and-persistence).
 *
 * Translates RecordTurnSkipResult -> HTTP: not_found -> 404,
 * refused_beat -> 409, forbidden -> 403. Per-user+chat rate limit -> 429.
 */
import { afterEach, beforeEach, expect, mock, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import { turnSkipRoutes, } from "./turn-skip-routes";

// Spy the auto-generation trigger: the route must fire it at most once per
// advance, and never for a deduped (replayed) advance.
const triggerCalls: Array<Record<string, unknown>> = [];
// Gated: mock.module is process-global (BUG 9c8bea1).
if (ISOLATED) {
  mock.module("../../generation/auto-gen", () => ({
    isLlmGenerationConfigured: () => true,
    triggerAutoGeneration: (input: Record<string, unknown>,) => {
      triggerCalls.push(input,);
      return Promise.resolve();
    },
  }),);
}

describeOrSkip("chats turn-skip-routes", () => {
  let db: Kysely<DB>;
  const OWNER_ID = crypto.randomUUID();
  const CHAT_ID = crypto.randomUUID();

  function makeApp(userId: string | undefined,) {
    const config = createConfigSchema().defaults as Config;
    return new Elysia({ name: "test-app", },)
      .derive(() => ({ userId, userRole: "user" as string | null, }))
      .use(turnSkipRoutes({ database: db, config, }, "/api",),);
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
},);

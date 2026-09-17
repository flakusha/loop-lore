// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for `npcMovementRoutes` (src/routes/npc-movement/index.ts).
 *
 * Contract: movement events are writable only by an authenticated caller and
 * read back per-chat for participants; non-participants get 404, schema
 * violations get 422, unauthenticated callers 401, and DB failures 500.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { npcMovementRoutes, } from "./index";

const R = "http://localhost/api/npc-movement";

/** Minimal `Kysely` shim whose `messages` queries throw — reaches the 500 branches. */
function brokenMessagesDb(db: Kysely<DB>,): Kysely<DB> {
  return {
    selectFrom(table: string,) {
      if (table === "messages") { throw new Error("boom",); }
      return db.selectFrom(table as never,);
    },
  } as unknown as Kysely<DB>;
}

/**
 * @param db
 * @param userId
 * @param userRole
 */
function authedApp(db: Kysely<DB>, userId: string, userRole = "user",): Elysia {
  return new Elysia({ name: "test-npc-movement", },)
    .derive(() => ({ userId, userRole, }))
    .use(npcMovementRoutes({ database: db, },),) as unknown as Elysia;
}

/**
 * @param db
 */
function anonymousApp(db: Kysely<DB>,): Elysia {
  return new Elysia({ name: "test-npc-movement-anon", },)
    .use(npcMovementRoutes({ database: db, },),) as unknown as Elysia;
}

/**
 * @param messageId
 * @param pattern
 */
function storeBody(messageId: string, pattern: string,) {
  return {
    messageId,
    events: [{
      actorId: "npc-1",
      fromLocationId: "loc-1",
      toLocationId: "loc-2",
      pattern,
      timestamp: "2026-02-01T10:00:00Z",
    },],
  };
}

describe("npcMovementRoutes", () => {
  let db: Kysely<DB>;
  const userId = uid();
  const outsiderId = uid();
  const creatorId = uid();
  const npcActor = uid();
  const chatId = uid();
  const msgId = uid();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    await insertUsers(db, "npc-route-user", "Npc Route User", { id: userId, } as never,);
    await insertUsers(db, "npc-route-outsider", "Outsider", { id: outsiderId, } as never,);
    await insertUsers(db, "npc-route-creator", "Creator", { id: creatorId, } as never,);
    await insertActors(db, "Player", { id: userId, owner_id: userId, } as never,);
    await insertActors(db, "Mover", { id: npcActor, owner_id: userId, } as never,);
    await insertChats(db, "Movement Chat", creatorId, { id: chatId, } as never,);
    await insertChatParticipants(db, chatId, userId, {},);
    await insertMessages(db, chatId, npcActor, "assistant", "scene", {
      id: msgId,
      created_at: "2026-01-01T10:00:00Z",
      metadata: JSON.stringify({
        movement: [{
          actorId: npcActor,
          fromLocationId: "loc-0",
          toLocationId: "loc-1",
          pattern: "patrol",
          timestamp: "2026-01-01T09:59:00Z",
        },],
      },),
    } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("POST events returns 401 without an authenticated user", async () => {
    const res = await anonymousApp(db,).handle(
      new Request(`${R}/events`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify(storeBody(msgId, "wander",),),
      },),
    );
    expect(res.status,).toBe(401,);
  });

  test("POST events rejects a body missing required fields with 422", async () => {
    const res = await authedApp(db, userId, "solo",).handle(
      new Request(`${R}/events`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ messageId: msgId, },),
      },),
    );
    expect(res.status,).toBe(422,);
  });

  test("POST events stores events that round-trip through GET", async () => {
    const app = authedApp(db, userId, "solo",);

    const stored = await app.handle(
      new Request(`${R}/events`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify(storeBody(msgId, "wander",),),
      },),
    );
    expect(stored.status,).toBe(200,);
    expect(await stored.json(),).toMatchObject({ success: true, },);

    const read = await app.handle(new Request(`${R}/events?chatId=${chatId}`,),);
    expect(read.status,).toBe(200,);
    const events = await read.json() as Array<{ actorId: string; pattern: string }>;
    expect(events.map((e,) => e.pattern),).toEqual(["patrol", "wander",],);
  });

  test("GET events rejects a request without chatId (422)", async () => {
    const res = await authedApp(db, userId,).handle(new Request(`${R}/events`,),);
    expect(res.status,).toBe(422,);
  });

  test("GET events hides the chat from non-participants (404)", async () => {
    const res = await authedApp(db, outsiderId,).handle(
      new Request(`${R}/events?chatId=${chatId}`,),
    );
    expect(res.status,).toBe(404,);
    expect(await res.json(),).toMatchObject({ error: "Chat not found", },);
  });

  test("GET recent/:chatId returns events for a participant", async () => {
    const res = await authedApp(db, userId,).handle(
      new Request(`${R}/recent/${chatId}?limit=5`,),
    );
    expect(res.status,).toBe(200,);
    const events = await res.json() as Array<{ pattern: string }>;
    expect(events.length,).toBeGreaterThan(0,);
  });

  test("GET recent/:chatId hides the chat from non-participants (404)", async () => {
    const res = await authedApp(db, outsiderId,).handle(
      new Request(`${R}/recent/${chatId}`,),
    );
    expect(res.status,).toBe(404,);
    expect(await res.json(),).toMatchObject({ error: "Chat not found", },);
  });

  test("POST events returns 500 when the store fails", async () => {
    const res = await authedApp(brokenMessagesDb(db,), userId, "solo",).handle(
      new Request(`${R}/events`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify(storeBody(msgId, "wander",),),
      },),
    );
    expect(res.status,).toBe(500,);
    expect(await res.json(),).toMatchObject({ error: "Internal server error", },);
  });

  test("GET events returns 500 when the read fails", async () => {
    const res = await authedApp(brokenMessagesDb(db,), userId,).handle(
      new Request(`${R}/events?chatId=${chatId}`,),
    );
    expect(res.status,).toBe(500,);
    expect(await res.json(),).toMatchObject({ error: "Internal server error", },);
  });

  test("GET recent/:chatId returns 500 when the read fails", async () => {
    const res = await authedApp(brokenMessagesDb(db,), userId,).handle(
      new Request(`${R}/recent/${chatId}`,),
    );
    expect(res.status,).toBe(500,);
    expect(await res.json(),).toMatchObject({ error: "Internal server error", },);
  });
});

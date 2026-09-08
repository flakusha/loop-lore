// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { messageSeenRoutes, } from "./message-seen";

const BASE = "http://localhost";

/**
 * @param db
 * @param userId
 * @param userRole
 */
function seenApp(db: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-seen", },)
    .derive(() => ({ userId, userRole, }))
    .use(messageSeenRoutes({ database: db, },),) as unknown as Elysia;
}

/**
 * @param path
 */
function get(path: string,): Request {
  return new Request(`${BASE}${path}`,);
}

/**
 * @param path
 * @param body
 */
function postSeen(path: string, body: unknown,): Request {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", },
    body: JSON.stringify(body,),
  },);
}

/**
 * @param path
 * @param actorId
 */
function deleteReq(path: string, actorId: string,): Request {
  return new Request(`${BASE}${path}?actorId=${actorId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", },
  },);
}

describe("messageSeenRoutes", () => {
  let db: Kysely<DB>;
  let chatId: string;
  let messageId: string;
  let actorId: string;
  let userId: string;
  // Second user + actor used to exercise the IDOR guards on POST/DELETE.
  let otherUserId: string;
  let otherActorId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    const testDb = await createTestDb();
    db = testDb.db;

    userId = uid();
    await insertUsers(db, "seen-user", "Seen User", { id: userId, } as never,);

    actorId = uid();
    await insertActors(db, "Seen User", { id: actorId, user_id: userId, } as never,);

    otherUserId = uid();
    await insertUsers(db, "seen-other", "Seen Other", { id: otherUserId, } as never,);
    otherActorId = uid();
    await insertActors(db, "Seen Other", { id: otherActorId, user_id: otherUserId, } as never,);

    chatId = uid();
    await insertChats(db, "Seen Chat", userId, { id: chatId, } as never,);
    await insertChatParticipants(db, chatId, actorId, {},);

    messageId = uid();
    await insertMessages(db, chatId, actorId, "user", "test", { id: messageId, } as never,);
  },);

  test("GET /api/messages/:id/seen returns empty viewer list when no records", async () => {
    const app = seenApp(db, userId, null,);
    const res = await app.handle(get(`/api/messages/${messageId}/seen`,),);
    expect(res.status,).toBe(200,);
    const body = await res.json();
    expect(Array.isArray(body,),).toBe(true,);
    expect(body.length,).toBe(0,);
  });

  test("POST /api/messages/:id/seen records seen state for actor", async () => {
    const app = seenApp(db, userId, null,);
    const res = await app.handle(postSeen(`/api/messages/${messageId}/seen`, { actorId, state: "seen", },),);
    expect(res.status,).toBe(200,);
    const body = await res.json();
    expect(body.ok,).toBe(true,);
    expect(body.state,).toBe("seen",);
  });

  test("GET /api/messages/:id/seen returns recorded seen-state viewer", async () => {
    const app = seenApp(db, userId, null,);
    const res = await app.handle(get(`/api/messages/${messageId}/seen`,),);
    expect(res.status,).toBe(200,);
    const body = await res.json();
    expect(body.length,).toBe(1,);
    expect(body[0].actorId,).toBe(actorId,);
    expect(body[0].state,).toBe("seen",);
  });

  test("POST /api/messages/:id/seen with state=processing records processing", async () => {
    const app = seenApp(db, userId, null,);
    const res = await app.handle(postSeen(`/api/messages/${messageId}/seen`, { actorId, state: "processing", },),);
    expect(res.status,).toBe(200,);
    const body = await res.json();
    expect(body.state,).toBe("processing",);
  });

  test("GET /api/messages/:id/seen reflects updated state", async () => {
    const app = seenApp(db, userId, null,);
    const res = await app.handle(get(`/api/messages/${messageId}/seen`,),);
    expect(res.status,).toBe(200,);
    const body = await res.json();
    expect(body.length,).toBe(1,);
    expect(body[0].state,).toBe("processing",);
  });

  test("DELETE /api/messages/:id/seen removes actor record", async () => {
    const app = seenApp(db, userId, null,);
    const res = await app.handle(deleteReq(`/api/messages/${messageId}/seen`, actorId,),);
    expect(res.status,).toBe(200,);
    const body = await res.json();
    expect(body.ok,).toBe(true,);
  });

  test("GET /api/messages/:id/seen returns empty after DELETE", async () => {
    const app = seenApp(db, userId, null,);
    const res = await app.handle(get(`/api/messages/${messageId}/seen`,),);
    expect(res.status,).toBe(200,);
    const body = await res.json();
    expect(body.length,).toBe(0,);
  });

  test("GET /messages/:id/seen returns 404 for non-existent message", async () => {
    const app = seenApp(db, userId, null,);
    const res = await app.handle(get("/api/messages/nonexistent-id/seen",),);
    expect(res.status,).toBe(404,);
  });

  test("GET /messages/:id/seen returns 401 without userId", async () => {
    const app = seenApp(db, null, null,);
    const res = await app.handle(get(`/api/messages/${messageId}/seen`,),);
    expect(res.status,).toBe(401,);
  });

  test("GET /messages/:id/seen returns 404 for user without chat access", async () => {
    const app = seenApp(db, otherUserId, null,);
    const res = await app.handle(get(`/api/messages/${messageId}/seen`,),);
    expect(res.status,).toBe(404,);
  });

  // ─── Hardening: state union + atomic upsert + IDOR guards ────

  test("POST rejects invalid state string with 422 (Elysia body validation)", async () => {
    const app = seenApp(db, userId, null,);
    const res = await app.handle(postSeen(`/api/messages/${messageId}/seen`, { actorId, state: "archived", },),);
    // Elysia emits 422 for body schema-validation failures (TypeBox union mismatch).
    expect(res.status,).toBe(422,);
  });
  test("POST re-mark preserves original seen_at (first-seen semantics)", async () => {
    const app = seenApp(db, userId, null,);

    // First mark
    const first = await app.handle(postSeen(`/api/messages/${messageId}/seen`, { actorId, state: "seen", },),);
    expect(first.status,).toBe(200,);

    // Snapshot seen_at via GET
    const beforeRes = await app.handle(get(`/api/messages/${messageId}/seen`,),);
    const before = (await beforeRes.json()).find((r: { actorId: string },) => r.actorId === actorId);
    expect(before?.seenAt,).toBeTruthy();

    // Second mark — should preserve seen_at (not overwrite with current time)
    const second = await app.handle(postSeen(`/api/messages/${messageId}/seen`, { actorId, state: "seen", },),);
    expect(second.status,).toBe(200,);

    const afterRes = await app.handle(get(`/api/messages/${messageId}/seen`,),);
    const after = (await afterRes.json()).find((r: { actorId: string },) => r.actorId === actorId);
    expect(after?.seenAt,).toBe(before?.seenAt,);
  });

  test("Two concurrent POSTs for same (msg, actor) both succeed with one row", async () => {
    const app = seenApp(db, userId, null,);
    const [a, b,] = await Promise.all([
      app.handle(postSeen(`/api/messages/${messageId}/seen`, { actorId, state: "seen", },),),
      app.handle(postSeen(`/api/messages/${messageId}/seen`, { actorId, state: "seen", },),),
    ],);
    expect(a.status,).toBe(200,);
    expect(b.status,).toBe(200,);

    const listRes = await app.handle(get(`/api/messages/${messageId}/seen`,),);
    const list = await listRes.json();
    const myEntries = list.filter((r: { actorId: string },) => r.actorId === actorId);
    expect(myEntries.length,).toBe(1,);
  });

  test("DELETE cannot delete another user's actor record", async () => {
    const app = seenApp(db, userId, null,);
    await db
      .insertInto("message_seen",)
      .values({
        id: `ms-${messageId}-${otherActorId}`,
        message_id: messageId,
        actor_id: otherActorId,
        state: "seen",
        seen_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },)
      .execute();

    const res = await app.handle(deleteReq(`/api/messages/${messageId}/seen`, otherActorId,),);
    expect(res.status,).toBe(403,);

    const row = await db
      .selectFrom("message_seen",)
      .select("id",)
      .where("id", "=", `ms-${messageId}-${otherActorId}`,)
      .executeTakeFirst();
    expect(row,).toBeDefined();
  });

  // ─── Server-derived actor (replaces client-supplied actorId) ────
  //
  // The POST handler now derives the actor from the session via
  // resolvePrimaryActorId (user-actor row where owner_id IS NULL). The
  // client no longer sends actorId — and even if a stale body carries one,
  // the server ignores it. These tests pin that contract.

  test("POST derives actor from session — body actorId is ignored", async () => {
    // Isolation: clear any prior seen state from earlier tests.
    await db.deleteFrom("message_seen",)
      .where("message_id", "=", messageId,)
      .execute();
    const app = seenApp(db, userId, null,);
    // Send otherActorId in body; session is userId. Server must use
    // userId's primary actor (actorId), not otherActorId.
    const res = await app.handle(
      postSeen(`/api/messages/${messageId}/seen`, { actorId: otherActorId, state: "seen", },),
    );
    expect(res.status,).toBe(200,);
    // GET should show actorId (not otherActorId) as the viewer.
    const listRes = await app.handle(get(`/api/messages/${messageId}/seen`,),);
    const list = await listRes.json();
    const ids = list.map((r: { actorId: string },) => r.actorId);
    expect(ids,).toContain(actorId,);
    expect(ids,).not.toContain(otherActorId,);
  });

  test("POST without body.actorId still works (new contract)", async () => {
    // Clear prior state for isolation.
    await db.deleteFrom("message_seen",)
      .where("message_id", "=", messageId,)
      .execute();
    const app = seenApp(db, userId, null,);
    const res = await app.handle(
      postSeen(`/api/messages/${messageId}/seen`, { state: "seen", },),
    );
    expect(res.status,).toBe(200,);
  });

  test("POST 404s when session user has no primary persona actor", async () => {
    // Third user with no actor row at all.
    const lonelyUserId = uid();
    await insertUsers(db, "seen-lonely", "Seen Lonely", { id: lonelyUserId, } as never,);
    const app = seenApp(db, lonelyUserId, null,);
    const res = await app.handle(
      postSeen(`/api/messages/${messageId}/seen`, { state: "seen", },),
    );
    expect(res.status,).toBe(404,);
  });
});

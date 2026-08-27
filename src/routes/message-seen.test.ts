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

function seenApp(db: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-seen", },)
    .derive(() => ({ userId, userRole, }))
    .use(messageSeenRoutes({ database: db, },),) as unknown as Elysia;
}

function get(path: string,): Request {
  return new Request(`${BASE}${path}`,);
}

function postSeen(path: string, body: unknown,): Request {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", },
    body: JSON.stringify(body,),
  },);
}

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

  beforeAll(async () => {
    createLogger({ level: "error", },);
    const testDb = await createTestDb();
    db = testDb.db;

    userId = uid();
    await insertUsers(db, "seen-user", "Seen User", { id: userId, } as never,);

    actorId = uid();
    await insertActors(db, "Seen User", { id: actorId, user_id: userId, } as never,);

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
    const otherUser = uid();
    await insertUsers(db, "other-user", "Other User", { id: otherUser, } as never,);
    const app = seenApp(db, otherUser, null,);
    const res = await app.handle(get(`/api/messages/${messageId}/seen`,),);
    expect(res.status,).toBe(404,);
  });
});

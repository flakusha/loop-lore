/**
 * E2E tests for activity routes (Elysia plugin)
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../test-utils/insert-helpers";
import { activityRoutes, } from "./activity";

/**
 * Build a tiny Elysia app using the activity routes. Optionally
 * inject an authenticated userId via `derive` (auth shim).
 * @param db
 * @param userId
 */
function makeApp(db: Kysely<DB>, userId?: string,) {
  const app = new Elysia({ name: "test-activity", },);
  if (userId) {
    app.derive(() => ({ userId, }));
  }
  return app.use(activityRoutes({ database: db, },),);
}

describe("activityRoutes", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "user1", "User One", { id: "user1" as never, },);
    await insertUsers(db, "user2", "User Two", { id: "user2" as never, },);
    await insertActors(db, "User One", { id: "user1" as never, actor_type: "user" as never, },);
    await insertActors(db, "User Two", { id: "user2" as never, actor_type: "user" as never, },);
  },);

  afterAll(() => sqlite.close());

  test("exports function", () => {
    expect(typeof activityRoutes,).toBe("function",);
  });

  test("returns Elysia plugin", () => {
    const plugin = activityRoutes({ database: db, },);
    expect(plugin,).toBeDefined();
  });

  test("returns 401 when no auth context", async () => {
    const res = await makeApp(db,).handle(new Request("http://localhost/api/chats/activity",),);
    expect(res.status,).toBe(401,);
    const body = await res.json() as { error: string };
    expect(typeof body.error,).toBe("string",);
  });

  test("returns empty map for user with no participants", async () => {
    const res = await makeApp(db, "user1",).handle(new Request("http://localhost/api/chats/activity",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { chats: Record<string, unknown> };
    expect(body.chats,).toEqual({},);
  });

  test("returns unseen counts for participants with messages", async () => {
    await insertChats(db, "Chat A", "user1", { id: "chat-a" as never, },);
    await insertChatParticipants(db, "chat-a", "user1",);
    await insertMessages(db, "chat-a", "user2", "user", "hello", { id: "msg-1" as never, },);
    await insertMessages(db, "chat-a", "user2", "user", "world", { id: "msg-2" as never, },);

    const res = await makeApp(db, "user1",).handle(new Request("http://localhost/api/chats/activity",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as {
      chats: Record<string, { unseenCount: number; chatName: string; lastMessageCreatedAt: string | null }>;
    };
    const chatA = body.chats["chat-a"];
    expect(chatA,).toBeDefined();
    if (chatA === undefined) { throw new Error("chat-a missing from response",); }
    expect(chatA.chatName,).toBe("Chat A",);
    expect(chatA.unseenCount,).toBe(2,);
    expect(chatA.lastMessageCreatedAt,).not.toBeNull();
  });
  test("ignores non-visible messages when counting unseen", async () => {
    await insertChats(db, "Chat Hidden", "user1", { id: "chat-hidden" as never, },);
    await insertChatParticipants(db, "chat-hidden", "user1",);
    await insertMessages(db, "chat-hidden", "user2", "user", "visible", { id: "m-vis" as never, },);
    await insertMessages(db, "chat-hidden", "user2", "user", "hidden", {
      id: "m-hid" as never,
      visibility: "hidden" as never,
    },);

    const res = await makeApp(db, "user1",).handle(new Request("http://localhost/api/chats/activity",),);
    const body = await res.json() as {
      chats: Record<string, { unseenCount: number }>;
    };
    const hidden = body.chats["chat-hidden"];
    expect(hidden,).toBeDefined();
    if (hidden === undefined) { throw new Error("chat-hidden missing from response",); }
    expect(hidden.unseenCount,).toBe(1,);
  });

  test("handles huge participantIds query (no crash, 200/401)", async () => {
    // Route doesn't read participantIds — verifies it tolerates long query strings
    const huge = Array.from({ length: 100, }, (_, i,) => `actor-${i}`,).join(",",);
    const url = `http://localhost/api/chats/activity?participantIds=${huge}`;
    const res = await makeApp(db, "user1",).handle(new Request(url,),);
    expect([200, 400,],).toContain(res.status,);
  });
});

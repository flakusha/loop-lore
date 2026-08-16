/**
 * Tests for activity-stream routes (SSE stream of per-chat unseen counts).
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
import { ActivityStreamer, activityStreamRoutes, } from "./activity-stream";

function makeApp(db: Kysely<DB>, userId?: string,) {
  const app = new Elysia({ name: "test-activity-stream", },);
  if (userId) {
    app.derive(() => ({ userId, }));
  }
  return app.use(activityStreamRoutes({ database: db, },),);
}

describe("activity-stream routes", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "user1", "User One", { id: "user1" as never, },);
    await insertUsers(db, "user2", "User Two", { id: "user2" as never, },);
    await insertActors(db, "User One", { id: "user1" as never, actor_type: "user" as never, },);
    await insertActors(db, "User Two", { id: "user2" as never, actor_type: "user" as never, },);
    await insertChats(db, "Chat A", "user1", { id: "chat-a" as never, },);
    await insertChatParticipants(db, "chat-a", "user1",);
    await insertMessages(db, "chat-a", "user2", "user", "hello there", { id: "msg-1" as never, },);
    await insertMessages(db, "chat-a", "user1", "assistant", "hi back", { id: "msg-2" as never, },);
  },);

  afterAll(() => sqlite.close());

  test("route requires auth", async () => {
    const res = await makeApp(db,).handle(new Request("http://localhost/api/activity/stream",),);
    expect(res.status,).toBe(401,);
  });

  test("route streams activity events", async () => {
    const res = await makeApp(db, "user1",).handle(new Request("http://localhost/api/activity/stream",),);
    expect(res.status,).toBe(200,);
    expect(res.headers.get("content-type",),).toContain("text/event-stream",);
    expect(res.headers.get("cache-control",),).toBe("no-cache",);

    const reader = res.body?.getReader();
    expect(reader,).toBeDefined();
    const { value, } = await reader!.read();
    reader!.cancel();
    const chunk = new TextDecoder().decode(value,);

    expect(chunk,).toContain("event: activity",);
    const dataLine = chunk.split("\n",).find((l,) => l.startsWith("data:",));
    expect(dataLine,).toBeDefined();
    const payload = JSON.parse(dataLine!.slice(5,),) as { chats: Record<string, unknown> };
    expect(payload.chats["chat-a"],).toBeDefined();
  });

  test("ActivityStreamer emits initial snapshot", async () => {
    const streamer = new ActivityStreamer(db, "user1", 5000,);
    const res = streamer.open();
    expect(res.headers.get("content-type",),).toContain("text/event-stream",);

    const reader = res.body?.getReader();
    const { value, } = await reader!.read();
    reader!.cancel();
    const chunk = new TextDecoder().decode(value,);
    expect(chunk,).toContain("event: activity",);

    const dataLine = chunk.split("\n",).find((l,) => l.startsWith("data:",));
    const payload = JSON.parse(dataLine!.slice(5,),) as { chats: Record<string, { unseenCount: number }> };
    expect(payload.chats["chat-a"]?.unseenCount,).toBe(2,); // all visible messages (no last_read set)
  });

  test("ActivityStreamer empty activity for non-participant", async () => {
    const streamer = new ActivityStreamer(db, "user2", 5000,);
    const res = streamer.open();
    const reader = res.body?.getReader();
    const { value, } = await reader!.read();
    reader!.cancel();
    const chunk = new TextDecoder().decode(value,);
    const dataLine = chunk.split("\n",).find((l,) => l.startsWith("data:",));
    const payload = JSON.parse(dataLine!.slice(5,),) as { chats: Record<string, unknown> };
    expect(payload.chats,).toEqual({},);
  });
});

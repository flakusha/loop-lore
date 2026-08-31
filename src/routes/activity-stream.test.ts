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

/**
 * @param db
 * @param userId
 */
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

  /** Fresh db with one chat and one visible message for streamer tests. */
  async function makeStreamDb() {
    const fresh = await createTestDb();
    const { db: freshDb, } = fresh;
    await insertUsers(freshDb, "user1", "User One", { id: "user1" as never, },);
    await insertActors(freshDb, "User One", { id: "user1" as never, actor_type: "user" as never, },);
    await insertChats(freshDb, "Chat A", "user1", { id: "chat-a" as never, },);
    await insertChatParticipants(freshDb, "chat-a", "user1",);
    await insertMessages(freshDb, "chat-a", "user1", "assistant", "hi", { id: "msg-0" as never, },);
    return fresh;
  }

  /**
   * Read the next SSE chunk, failing fast if nothing arrives in time.
   * @param reader
   * @param ms
   */
  async function readChunkWithTimeout(reader: ReadableStreamDefaultReader<Uint8Array>, ms = 500,) {
    const timeout = new Promise<{ done: boolean; value?: undefined }>((resolve,) => {
      setTimeout(() => resolve({ done: true, value: undefined, },), ms,);
    },);
    return await Promise.race([reader.read(), timeout,],) as
      | { done: boolean; value?: Uint8Array }
      | { done: true; value?: undefined };
  }

  test("ActivityStreamer tick emits when the snapshot changes", async () => {
    const { db: freshDb, sqlite, } = await makeStreamDb();
    const streamer = new ActivityStreamer(freshDb, "user1", 20,);
    const reader = streamer.open().body!.getReader();

    const initial = await readChunkWithTimeout(reader,);
    expect(new TextDecoder().decode(initial.value,),).toContain("event: activity",);

    // New message changes the unseen count → next tick must emit.
    await insertMessages(freshDb, "chat-a", "user1", "assistant", "second", { id: "msg-1" as never, },);

    const next = await readChunkWithTimeout(reader,);
    const chunk = new TextDecoder().decode(next.value,);
    expect(chunk,).toContain("event: activity",);
    const dataLine = chunk.split("\n",).find((l,) => l.startsWith("data:",));
    const payload = JSON.parse(dataLine!.slice(5,),) as { chats: Record<string, { unseenCount: number }> };
    expect(payload.chats["chat-a"]?.unseenCount,).toBe(2,);

    reader.cancel();
    sqlite.close();
  });

  test("ActivityStreamer tick stays quiet when nothing changed", async () => {
    const { db: freshDb, sqlite, } = await makeStreamDb();
    const streamer = new ActivityStreamer(freshDb, "user1", 20,);
    const reader = streamer.open().body!.getReader();

    const initial = await readChunkWithTimeout(reader,);
    expect(new TextDecoder().decode(initial.value,),).toContain("event: activity",);

    // No DB change → several ticks pass without a second event.
    const second = await readChunkWithTimeout(reader, 100,);
    expect(second.done,).toBe(true,); // timed out, no chunk

    reader.cancel();
    sqlite.close();
  });

  test("ActivityStreamer emits stream-error when the database fails", async () => {
    // A db whose sqlite connection is already closed → computeActivity throws.
    const { db: deadDb, sqlite: deadSqlite, } = await createTestDb();
    deadSqlite.close();

    const streamer = new ActivityStreamer(deadDb, "user1", 20,);
    const reader = streamer.open().body!.getReader();
    const { value, } = await reader.read();
    const chunk = new TextDecoder().decode(value,);
    expect(chunk,).toContain("event: stream-error",);

    reader.cancel();
  });

  test("ActivityStreamer emits keepalive ping while idle", async () => {
    const { db: freshDb, sqlite, } = await makeStreamDb();
    const streamer = new ActivityStreamer(freshDb, "user1", 20,);
    const reader = streamer.open().body!.getReader();

    const initial = await readChunkWithTimeout(reader,);
    expect(new TextDecoder().decode(initial.value,),).toContain("event: activity",);

    // No DB change → the 8s keepalive is the next event on the wire.
    const keepalive = await readChunkWithTimeout(reader, 8500,);
    const chunk = new TextDecoder().decode(keepalive.value,);
    expect(chunk,).toContain("event: ping",);
    const dataLine = chunk.split("\n",).find((l,) => l.startsWith("data:",));
    const payload = JSON.parse(dataLine!.slice(5,),) as { t: number };
    expect(typeof payload.t,).toBe("number",);

    reader.cancel();
    sqlite.close();
  }, 15_000,);

  test("ActivityStreamer send tolerates a closed controller", async () => {
    const { db: freshDb, sqlite, } = await makeStreamDb();
    const streamer = new ActivityStreamer(freshDb, "user1", 20,);
    const reader = streamer.open().body!.getReader();

    const initial = await readChunkWithTimeout(reader,);
    expect(initial.value,).toBeDefined();
    await reader.cancel();

    // Let at least one tick fire against the cancelled controller — the
    // enqueue throw must be swallowed, not surface as an unhandled rejection.
    await new Promise((resolve,) => setTimeout(resolve, 60,));
    await expect(reader.closed,).resolves.toBeUndefined();
    sqlite.close();
  });
});

/**
 * Route tests for actor-memories carry endpoints — per-chat inclusion.
 *
 * POST /:id/carry creates a chat-scoped copy of a memory; POST
 * /carry-except converts a full-carry chat to selective by copying every
 * memory except the excluded one (skipping rows already carried).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertChats, } from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { actorMemoriesRoutes, } from "./actor-memories";

const mockConfig = {} as Config;

/**
 * @param db
 * @param userId
 * @param userRole
 */
function createApp(db: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-memories-carry", },)
    .derive(() => ({ userId, userRole, }))
    .use(actorMemoriesRoutes({ database: db, config: mockConfig, },),) as unknown as Elysia;
}

describe("actorMemoriesRoutes — carry endpoints", () => {
  let db: Kysely<DB>;
  let sqlite: { close(): void };
  let actorId: string;
  const userId = uid();
  const chatId = uid();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    const ctx = await createTestDb();
    db = ctx.db;
    sqlite = ctx.sqlite;
    await db
      .insertInto("users",)
      .values({
        id: userId,
        username: `u-${userId}`,
        display_name: "Test User",
        role: "user",
        status: "active",
        settings: "{}",
      },)
      .execute();
    actorId = uid();
    await db
      .insertInto("actors",)
      .values({
        id: actorId,
        actor_type: "character",
        display_name: "Test Character",
        user_id: userId,
        owner_id: userId,
        agent_type: "ai",
        settings: "{}",
        import_spec: "{}",
      },)
      .execute();
    await insertChats(db, "Carry Chat", userId, { id: chatId, } as never,);
    for (const [id, content,] of [["mem-a", "alpha",], ["mem-b", "beta",], ["mem-c", "gamma",],] as const) {
      await db
        .insertInto("actor_memories",)
        .values({
          id,
          actor_id: actorId,
          content,
          memory_type: "episodic",
          confidence: 1,
          importance: 1,
          keywords: "[]",
          source_message_ids: "[]",
          scope: "character",
          pinned: "unpinned",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },)
        .execute();
    }
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("carry creates a chat-scoped copy with the source content", async () => {
    const res = await createApp(db, userId, "user",).handle(
      new Request(`http://localhost/api/actors/${actorId}/memories/mem-a/carry`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ chatId, },),
      },),
    );
    expect(res.status,).toBe(200,);
    const copies = await db
      .selectFrom("actor_memories",)
      .selectAll()
      .where("source_chat_id", "=", chatId,)
      .execute();
    expect(copies,).toHaveLength(1,);
    expect(copies[0]?.content,).toBe("alpha",);
    expect(copies[0]?.actor_id,).toBe(actorId,);
    expect(copies[0]?.id,).not.toBe("mem-a",);
  });

  test("carry-except copies every memory except the excluded and already-carried ones", async () => {
    const res = await createApp(db, userId, "user",).handle(
      new Request(`http://localhost/api/actors/${actorId}/memories/carry-except`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ chatId, excludeId: "mem-b", },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { carried: number };
    // mem-a already carried for this chat; mem-b excluded → only mem-c copies.
    expect(body.carried,).toBe(1,);
    const copies = await db
      .selectFrom("actor_memories",)
      .select(["content", "source_chat_id",],)
      .where("source_chat_id", "=", chatId,)
      .execute();
    expect(copies.map((c,) => c.content).sort((a, b,) => a.localeCompare(b,)),).toEqual(["alpha", "gamma",],);
  });

  test("carry on behalf of a non-owner returns 404", async () => {
    const res = await createApp(db, uid(), "user",).handle(
      new Request(`http://localhost/api/actors/${actorId}/memories/mem-a/carry`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ chatId, },),
      },),
    );
    expect(res.status,).toBe(404,);
  });
});

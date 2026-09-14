/**
 * E2E tests for actor-memories routes (Elysia plugin)
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, it, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../test-utils/insert-helpers";
import { actorMemoriesRoutes, } from "./actor-memories";

/**
 * @param db
 * @param userId
 */
function makeApp(db: Kysely<DB>, userId?: string,) {
  const app = new Elysia({ name: "test-actor-memories", },);
  if (userId) {
    app.derive(() => ({ userId, }));
  }
  return app.use(actorMemoriesRoutes({ database: db, config: {} as never, },),);
}

describe("actorMemoriesRoutes", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "user1", "User One", { id: "user1" as never, },);
    await insertActors(db, "User One", {
      id: "user1" as never,
      actor_type: "user" as never,
      user_id: "user1" as never,
    },);
  },);

  afterAll(() => sqlite.close());

  test("exports function", () => {
    expect(typeof actorMemoriesRoutes,).toBe("function",);
  });

  test("returns Elysia plugin", () => {
    const plugin = actorMemoriesRoutes({ database: db, config: {} as never, },);
    expect(plugin,).toBeDefined();
  });

  test("list returns 404 for unknown actor", async () => {
    const res = await makeApp(db, "user1",).handle(
      new Request("http://localhost/api/actors/nonexistent/memories",),
    );
    expect(res.status,).toBe(404,);
  });

  test("create succeeds with content", async () => {
    const res = await makeApp(db, "user1",).handle(
      new Request("http://localhost/api/actors/user1/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ content: "Some memory content", },),
      },),
    );
    expect(res.status,).toBe(201,);
  });

  test("create rejects empty content with 400", async () => {
    const res = await makeApp(db, "user1",).handle(
      new Request("http://localhost/api/actors/user1/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ content: "", },),
      },),
    );
    expect(res.status,).toBe(400,);
  });

  it("expand endpoint reconstructs the bound chain", async () => {
    const { createTestDb, } = await import("../test-utils/create-test-db");
    const { insertChats, insertMessages, } = await import("../test-utils/insert-helpers");
    const { storeMemories, } = await import("../memory/extraction");
    const { db: edb, } = await createTestDb();
    await insertUsers(edb, "exp-user", "Exp User", { id: "user-exp", } as never,);
    await insertChats(edb, "Exp Chat", "user-exp", { id: "chat-exp", } as never,);
    await insertActors(edb, "Exp Actor", { id: "user-exp", actor_type: "user", user_id: "user-exp", } as never,);
    await insertMessages(
      edb,
      "chat-exp",
      "user-exp",
      "user",
      "expandable message here",
      { id: "msg-exp-1", } as never,
    );
    await storeMemories(edb, "user-exp", "chat-exp", [
      {
        content: "Expandable summary of length",
        memoryType: "episodic",
        confidence: 0.9,
        importance: 1,
        keywords: [],
      },
    ], { sourceMessageIds: ["msg-exp-1",], sourceChatIds: ["chat-exp",], },);
    const row = await edb
      .selectFrom("actor_memories",)
      .select("id",)
      .where("actor_id", "=", "user-exp",)
      .executeTakeFirstOrThrow();
    const app = makeApp(edb, "user-exp",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/user-exp/memories/${row.id}/expand`,),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { summary: string; messages: { id: string }[]; truncated: boolean };
    expect(body.summary,).toContain("Expandable",);
    expect(body.messages.map((m,) => m.id),).toEqual(["msg-exp-1",],);
    expect(body.truncated,).toBe(false,);
  });

  it("expand endpoint denies non-owners", async () => {
    const { createTestDb, } = await import("../test-utils/create-test-db");
    const { insertChats, insertMessages, } = await import("../test-utils/insert-helpers");
    const { storeMemories, } = await import("../memory/extraction");
    const { db: edb, } = await createTestDb();
    await insertUsers(edb, "own-user", "Own User", { id: "user-own", } as never,);
    await insertChats(edb, "Own Chat", "user-own", { id: "chat-own", } as never,);
    await insertActors(edb, "Own Actor", { id: "user-own", actor_type: "user", user_id: "user-own", } as never,);
    await insertMessages(
      edb,
      "chat-own",
      "user-own",
      "user",
      "private message here",
      { id: "msg-own-1", } as never,
    );
    await storeMemories(edb, "user-own", "chat-own", [
      {
        content: "Private summary of length",
        memoryType: "episodic",
        confidence: 0.9,
        importance: 1,
        keywords: [],
      },
    ], { sourceMessageIds: ["msg-own-1",], sourceChatIds: ["chat-own",], },);
    const row = await edb
      .selectFrom("actor_memories",)
      .select("id",)
      .where("actor_id", "=", "user-own",)
      .executeTakeFirstOrThrow();
    const res = await makeApp(edb, "intruder",).handle(
      new Request(`http://localhost/api/actors/user-own/memories/${row.id}/expand`,),
    );
    expect(res.status,).toBe(404,);
  });

  it("expand treats hostile source ids as literal strings (parameterized IN)", async () => {
    const { createTestDb, } = await import("../test-utils/create-test-db");
    const { insertChats, insertMessages, } = await import("../test-utils/insert-helpers");
    const { db: sdb, } = await createTestDb();
    await insertUsers(sdb, "inj-user", "Inj User", { id: "user-inj", } as never,);
    await insertChats(sdb, "Inj Chat", "user-inj", { id: "chat-inj", } as never,);
    await insertActors(sdb, "Inj Actor", { id: "user-inj", actor_type: "user", user_id: "user-inj", } as never,);
    await insertMessages(
      sdb,
      "chat-inj",
      "user-inj",
      "user",
      "real message here",
      { id: "msg-inj-1", } as never,
    );
    // Simulate any writer storing a hostile JSON array in the bound-chain
    // column: SQL-syntax payloads must stay bound parameters, never text
    // spliced into the query.
    await sdb
      .insertInto("actor_memories",)
      .values({
        id: "mem-inj",
        actor_id: "user-inj",
        content: "Injection probe summary of length",
        memory_type: "episodic",
        confidence: 0.9,
        importance: 1,
        keywords: "[]",
        source_chat_id: "chat-inj",
        scope: "character",
        privacy: "shared",
        source_message_ids: JSON.stringify([
          "x'; DROP TABLE actor_memories; --",
          "' OR '1'='1",
          "msg-inj-1",
        ],),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },)
      .execute();
    const res = await makeApp(sdb, "user-inj",).handle(
      new Request("http://localhost/api/actors/user-inj/memories/mem-inj/expand",),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { messages: { id: string }[] };
    // Only the real id resolves; payloads were compared literally.
    expect(body.messages.map((m,) => m.id),).toEqual(["msg-inj-1",],);
    // The dropped-table payload had no effect.
    const survived = await sdb.selectFrom("actor_memories",).select("id",).execute();
    expect(survived.length,).toBeGreaterThanOrEqual(1,);
  });

  test("list returns owned actor's memories", async () => {
    const res = await makeApp(db, "user1",).handle(
      new Request("http://localhost/api/actors/user1/memories",),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { data: unknown[] };
    expect(Array.isArray(body.data,),).toBe(true,);
  });
});

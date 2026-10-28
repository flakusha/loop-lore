/**
 * Unit tests for story-turns routes (Elysia plugin)
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertChats, insertStoryTurns, insertUsers, } from "../test-utils/insert-helpers";
import { storyTurnsRoutes, } from "./story-turns";

const mockDb = {} as any;
const mockConfig = {} as any;

describe("storyTurnsRoutes", () => {
  test("exports function", () => {
    expect(typeof storyTurnsRoutes,).toBe("function",);
  });

  test("returns Elysia plugin", () => {
    const plugin = storyTurnsRoutes({ database: mockDb, config: mockConfig, },);
    expect(plugin,).toBeDefined();
  });
});

describe("storyTurnsRoutes — pagination", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  const USER = "00000000-0000-4000-8000-0000000000a1";
  const CHAT = "00000000-0000-4000-8000-0000000000b1";
  const ACTOR = "00000000-0000-4000-8000-0000000000c1";

  /**
   * @param userId
   * @param userRole
   */
  function makeApp(userId: string, userRole = "user",) {
    return new Elysia({ name: "test-story-turns", },)
      .derive(() => ({ userId, userRole, }))
      .use(storyTurnsRoutes({ database: db, config: mockConfig, },),) as unknown as Elysia;
  }

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: USER as never, },);
    await insertActors(db, "Actor", { id: ACTOR as never, owner_id: USER, user_id: USER, },);
    await insertChats(db, "Chat", USER, { id: CHAT as never, },);

    for (let i = 1; i <= 5; i++) {
      await insertStoryTurns(db, CHAT, i, ACTOR, "narration", "prompt",);
    }
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("rejects a negative page size instead of returning every turn", async () => {
    const app = makeApp(USER,);
    const res = await app.handle(
      new Request("http://localhost/api/chats/" + CHAT + "/story-turns?pageSize=-1",),
    );

    expect(res.status,).toBe(400,);
  });

  test("rejects a non-numeric page", async () => {
    const app = makeApp(USER,);
    const res = await app.handle(
      new Request("http://localhost/api/chats/" + CHAT + "/story-turns?page=abc",),
    );

    expect(res.status,).toBe(400,);
  });

  test("serves a bounded page of turns", async () => {
    const app = makeApp(USER,);
    const res = await app.handle(
      new Request("http://localhost/api/chats/" + CHAT + "/story-turns?pageSize=2",),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as { data: unknown[]; pagination: { total: number } };
    expect(body.data.length,).toBe(2,);
    expect(body.pagination.total,).toBe(5,);
  });

  test("serves a single turn of an owned chat", async () => {
    const app = makeApp(USER,);
    const listed = await app.handle(new Request("http://localhost/api/chats/" + CHAT + "/story-turns",),);
    const body = await listed.json() as { data: { id: string }[] };
    const turnId = body.data[0]!.id;

    const res = await app.handle(
      new Request("http://localhost/api/chats/" + CHAT + "/story-turns/" + turnId,),
    );

    expect(res.status,).toBe(200,);
    const turn = await res.json() as { id: string };
    expect(turn.id,).toBe(turnId,);
  });

  test("answers 404 for an unknown turn id", async () => {
    const app = makeApp(USER,);
    const res = await app.handle(
      new Request("http://localhost/api/chats/" + CHAT + "/story-turns/00000000-0000-4000-8000-0000000000ee",),
    );

    expect(res.status,).toBe(404,);
  });
});

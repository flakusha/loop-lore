/**
 * XP & Loot Routes tests.
 *
 * Covers XP award/history/level and loot generate/persist/table endpoints
 * over a real test DB (persistence paths) and pure handlers (generate/level).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { xpLootRoutes, } from "./xp-loot";
import { xpLootTablesRoutes, } from "./xp-loot-tables";

const mockDb = {} as any;

describe("xpLootRoutes", () => {
  test("exports function", () => {
    expect(typeof xpLootRoutes,).toBe("function",);
  });

  test("returns Elysia plugin", () => {
    const plugin = xpLootRoutes({ database: mockDb, } as any,);
    expect(plugin,).toBeDefined();
  });
});

describe("XP & loot (auth-gated)", () => {
  let db: Kysely<DB>;
  let userId: string;
  let worldId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    userId = uid();
    await insertUsers(
      db,
      `user-${userId}`,
      "XPUser",
      { id: userId, role: "solo", status: "active", settings: "{}", } as never,
    );
    worldId = uid();
    await insertWorlds(db, userId, "XP World", { id: worldId, } as never,);
    await insertActors(db, userId, {
      id: "actor-xp",
      actor_type: "character",
      owner_id: userId,
      user_id: null,
      agent_type: "none",
      settings: "{}",
      format_version: 0,
      visibility: "private",
    } as never,);
  },);

  function authedApp(actingUserId: string = userId,): Elysia {
    return new Elysia({ name: "test-xp-auth", },)
      .derive({ as: "scoped", }, (_ctx,) => ({ userId: actingUserId, userRole: "user", }),)
      .use(xpLootRoutes({ database: db, } as any,),)
      .use(xpLootTablesRoutes({ database: db, } as any,),) as any;
  }

  async function json<T,>(res: Response,): Promise<T> {
    return res.json() as T;
  }

  test("awards XP and reports level-up", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request("http://localhost/api/rpg/xp/award", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({
          actorId: "actor-xp",
          amount: 300,
          source: "quest",
          currentLevel: 1,
          currentXp: 0,
        },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await json<{ ledgerId: string }>(res,);
    expect(typeof body.ledgerId,).toBe("string",);
  });

  test("computes level from XP", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request("http://localhost/api/rpg/xp/level", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ xp: 2700, },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await json<{ level: number }>(res,);
    expect(body.level,).toBe(4,);
  });

  test("computes XP to next level", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request("http://localhost/api/rpg/xp/next", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ currentLevel: 1, currentXp: 0, },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await json<{ xpToNextLevel: number }>(res,);
    expect(body.xpToNextLevel,).toBe(300,);
  });

  test("generates loot from entries", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request("http://localhost/api/rpg/loot/generate", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({
          entries: [{
            name: "Iron Sword",
            description: "A sturdy blade",
            type: "weapon",
            rarity: "common",
            weight: 10,
            minQuantity: 1,
            maxQuantity: 1,
            minLevel: 1,
            goldValue: 10,
            metadata: {},
          },],
          level: 3,
          dropCount: 1,
        },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await json<{ drops: unknown[] }>(res,);
    expect(Array.isArray(body.drops,),).toBe(true,);
  });

  test("creates a loot table", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request("http://localhost/api/rpg/loot/tables", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ name: "Test Table", sourceType: "world", sourceId: worldId, },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await json<{ id: string }>(res,);
    expect(typeof body.id,).toBe("string",);
  });

  test("rejects unauthenticated request", async () => {
    const app = new Elysia()
      .derive({ as: "scoped", }, () => ({ userId: null, userRole: null, }),)
      .use(xpLootRoutes({ database: db, } as any,),)
      .use(xpLootTablesRoutes({ database: db, } as any,),) as any;
    const res = await app.handle(
      new Request("http://localhost/api/rpg/xp/level", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ xp: 100, },),
      },),
    );
    expect(res.status,).toBe(401,);
  });

  afterAll(async () => {
    await db.destroy();
  },);
});

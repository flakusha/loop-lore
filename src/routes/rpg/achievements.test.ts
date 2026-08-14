/**
 * Achievements Routes tests.
 *
 * Mounts the achievements routes behind a stub auth middleware and exercises
 * definitions CRUD + player-progress over a real test DB. Verifies that a
 * player may only access their own achievement progress (403 for others).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { achievementsRoutes, } from "./achievements";

const mockDb = {} as any;

describe("achievementsRoutes", () => {
  test("exports function", () => {
    expect(typeof achievementsRoutes,).toBe("function",);
  });

  test("returns Elysia plugin", () => {
    const plugin = achievementsRoutes({ database: mockDb, config: {} as never, },);
    expect(plugin,).toBeDefined();
  });
});

describe("achievements CRUD + progress (auth-gated)", () => {
  let db: Kysely<DB>;
  let userId: string;
  let achievementId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    userId = uid();
    await insertUsers(
      db,
      `user-${userId}`,
      "Achiever",
      { id: userId, role: "solo", status: "active", settings: "{}", } as never,
    );
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  function authedApp(actingUserId: string = userId,): Elysia {
    return new Elysia({ name: "test-achievements-auth", },)
      .derive({ as: "scoped", }, (_ctx,) => ({ userId: actingUserId, userRole: "user", }),)
      .use(achievementsRoutes({ database: db, config: {} as never, },),) as any;
  }

  async function json(res: Response,): Promise<unknown> {
    return res.json() as unknown;
  }

  function readId(body: unknown,): string {
    if (typeof body === "object" && body !== null && "id" in body && typeof body.id === "string") {
      return body.id;
    }
    throw new Error("response missing string id",);
  }

  const body = {
    name: "First Blood",
    description: "Defeat your first enemy",
    category: "combat",
    tier: "bronze",
    unlockCondition: { type: "counter", target: "enemies_defeated", count: 1, },
  };

  test("create achievement returns id", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request("http://localhost/api/rpg/achievements", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify(body,),
      },),
    );
    expect(res.status,).toBe(201,);
    achievementId = readId(await json(res,),);
    expect(achievementId,).toBeString();
  });

  test("get achievement returns it", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/achievements/${achievementId}`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await json(res,)) as { name?: string };
    expect(body.name,).toBe("First Blood",);
  });

  test("list achievements includes created", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request("http://localhost/api/rpg/achievements?category=combat",),
    );
    expect(res.status,).toBe(200,);
    const body = (await json(res,)) as { achievements?: unknown[] };
    expect(Array.isArray(body.achievements,),).toBe(true,);
    expect(body.achievements!.length,).toBeGreaterThanOrEqual(1,);
  });

  test("update achievement", async () => {
    const app = authedApp();
    // eslint-disable-next-line unicorn/max-nested-calls -- request construction nesting is test infrastructure
    const req = new Request(`http://localhost/api/rpg/achievements/${achievementId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify({ tier: "silver", },),
    },);
    const res = await app.handle(req,);
    expect(res.status,).toBe(200,);
    const body = (await json(res,)) as { tier?: string };
    expect(body.tier,).toBe("silver",);
  });

  test("update progress on own player", async () => {
    const app = authedApp();
    // eslint-disable-next-line unicorn/max-nested-calls -- request construction nesting is test infrastructure
    const req = new Request(`http://localhost/api/rpg/achievements/player/${userId}/${achievementId}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify({ progressIncrement: 1, },),
    },);
    const res = await app.handle(req,);
    expect(res.status,).toBe(200,);
    const body = (await json(res,)) as { newProgress?: number; unlocked?: boolean };
    expect(body.newProgress,).toBe(1,);
  });

  test("get own player progress list", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/achievements/player/${userId}`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await json(res,)) as { progress?: unknown[] };
    expect(Array.isArray(body.progress,),).toBe(true,);
    expect(body.progress!.length,).toBeGreaterThanOrEqual(1,);
  });

  test("rejects non-owner player access with 403", async () => {
    const otherUserId = uid();
    const app = authedApp(otherUserId,);
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/achievements/player/${userId}`,),
    );
    expect(res.status,).toBe(403,);
  });

  test("delete achievement", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/achievements/${achievementId}`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(200,);

    const afterRes = await app.handle(
      new Request(`http://localhost/api/rpg/achievements/${achievementId}`,),
    );
    expect(afterRes.status,).toBe(404,);
  });
});

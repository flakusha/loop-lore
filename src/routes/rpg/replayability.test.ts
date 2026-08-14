/**
 * Replayability Routes tests.
 *
 * Mounts the replayability routes behind a stub auth middleware and exercises
 * playthrough start/get/list, choice/secret/complete, new game plus, and
 * meta-progression over a real test DB. Verifies playthrough ownership gating
 * (403 for non-owners).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { replayabilityRoutes, } from "./replayability";

const mockDb = {} as any;

describe("replayabilityRoutes", () => {
  test("exports function", () => {
    expect(typeof replayabilityRoutes,).toBe("function",);
  });

  test("returns Elysia plugin", () => {
    const plugin = replayabilityRoutes({ database: mockDb, config: {} as never, },);
    expect(plugin,).toBeDefined();
  });
});

describe("replayability (auth-gated)", () => {
  let db: Kysely<DB>;
  let userId: string;
  let worldId: string;
  let playthroughId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    userId = uid();
    await insertUsers(
      db,
      `user-${userId}`,
      "Replayer",
      { id: userId, role: "solo", status: "active", settings: "{}", } as never,
    );
    worldId = uid();
    await insertWorlds(db, userId, "Replay World", { id: worldId, } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  function authedApp(actingUserId: string = userId,): Elysia {
    return new Elysia({ name: "test-replayability-auth", },)
      .derive({ as: "scoped", }, (_ctx,) => ({ userId: actingUserId, userRole: "user", }),)
      .use(replayabilityRoutes({ database: db, config: {} as never, },),) as any;
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

  test("start playthrough returns id", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request("http://localhost/api/rpg/replayability/playthroughs", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ playerId: userId, worldId, },),
      },),
    );
    expect(res.status,).toBe(201,);
    playthroughId = readId(await json(res,),);
    expect(playthroughId,).toBeString();
  });

  test("get playthrough", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/replayability/playthroughs/${playthroughId}`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await json(res,)) as { playerId?: string };
    expect(body.playerId,).toBe(userId,);
  });

  test("list player playthroughs", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/replayability/players/${userId}/playthroughs?worldId=${worldId}`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await json(res,)) as { playthroughs?: unknown[] };
    expect(Array.isArray(body.playthroughs,),).toBe(true,);
    expect(body.playthroughs!.length,).toBeGreaterThanOrEqual(1,);
  });

  test("record secret found", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/replayability/playthroughs/${playthroughId}/secret`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        // eslint-disable-next-line unicorn/max-nested-calls -- request body nesting is test infrastructure
        body: JSON.stringify({ secretId: uid(), },),
      },),
    );
    expect(res.status,).toBe(200,);
  });

  test("complete playthrough", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/replayability/playthroughs/${playthroughId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        // eslint-disable-next-line unicorn/max-nested-calls -- request body nesting is test infrastructure
        body: JSON.stringify({ endingId: uid(), endingType: "good", completionTime: 3600, },),
      },),
    );
    expect(res.status,).toBe(200,);
  });

  test("start new game plus", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request("http://localhost/api/rpg/replayability/new-game-plus", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ playerId: userId, worldId, previousPlaythroughId: playthroughId, },),
      },),
    );
    expect(res.status,).toBe(201,);
  });

  test("get meta progression", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/replayability/players/${userId}/meta`,),
    );
    expect(res.status,).toBe(200,);
  });

  test("rejects non-owner playthrough access with 403", async () => {
    const otherUserId = uid();
    const app = authedApp(otherUserId,);
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/replayability/playthroughs/${playthroughId}`,),
    );
    expect(res.status,).toBe(403,);
  });

  test("rejects meta access for another player with 403", async () => {
    const otherUserId = uid();
    const app = authedApp(otherUserId,);
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/replayability/players/${userId}/meta`,),
    );
    expect(res.status,).toBe(403,);
  });
});

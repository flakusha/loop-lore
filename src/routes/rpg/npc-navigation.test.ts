/**
 * NPC Navigation Routes tests.
 *
 * Mounts the NPC navigation routes behind a stub auth middleware and
 * exercises state get/update, pattern set, move, and tick over a real test
 * DB. Verifies actor-ownership gating (403 for non-owners).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertLocations,
  insertNpcStates,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { npcNavigationRoutes, } from "./npc-navigation";

const mockDb = {} as any;

describe("npcNavigationRoutes", () => {
  test("exports function", () => {
    expect(typeof npcNavigationRoutes,).toBe("function",);
  });

  test("returns Elysia plugin", () => {
    const plugin = npcNavigationRoutes({ database: mockDb, config: {} as never, },);
    expect(plugin,).toBeDefined();
  });
});

describe("npc navigation (auth-gated)", () => {
  let db: Kysely<DB>;
  let userId: string;
  let worldId: string;
  let actorId: string;
  let locationId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    userId = uid();
    await insertUsers(
      db,
      `user-${userId}`,
      "Navigator",
      { id: userId, role: "solo", status: "active", settings: "{}", } as never,
    );
    worldId = uid();
    await insertWorlds(db, userId, "Nav World", { id: worldId, } as never,);
    actorId = uid();
    await insertActors(db, "Nav NPC", { id: actorId, owner_id: userId, } as never,);
    locationId = uid();
    await insertLocations(db, worldId, "Nav Location", { id: locationId, } as never,);
    await insertNpcStates(db, actorId, worldId, { location_id: null, },);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  function authedApp(actingUserId: string = userId,): Elysia {
    return new Elysia({ name: "test-npc-nav-auth", },)
      .derive({ as: "scoped", }, (_ctx,) => ({ userId: actingUserId, userRole: "user", }),)
      .use(npcNavigationRoutes({ database: db, config: {} as never, },),) as any;
  }

  async function json(res: Response,): Promise<unknown> {
    return res.json() as unknown;
  }

  test("get movement state", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/npc-navigation/actors/${actorId}/state?worldId=${worldId}`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await json(res,)) as { actorId?: string };
    expect(body.actorId,).toBe(actorId,);
  });

  test("update movement state", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/npc-navigation/actors/${actorId}/state`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ worldId, updates: { speed: 3, }, },),
      },),
    );
    expect(res.status,).toBe(200,);
  });

  test("set movement pattern", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/npc-navigation/actors/${actorId}/pattern`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ worldId, pattern: "patrol", },),
      },),
    );
    expect(res.status,).toBe(200,);
  });

  test("move to location", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/npc-navigation/actors/${actorId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ worldId, targetLocationId: locationId, },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = (await json(res,)) as { success?: boolean };
    expect(body.success,).toBe(true,);
  });

  test("process movement tick", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/npc-navigation/worlds/${worldId}/tick`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({},),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = (await json(res,)) as { results?: unknown[] };
    expect(Array.isArray(body.results,),).toBe(true,);
  });

  test("rejects non-owner actor access with 403", async () => {
    const otherUserId = uid();
    const app = authedApp(otherUserId,);
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/npc-navigation/actors/${actorId}/state?worldId=${worldId}`,),
    );
    expect(res.status,).toBe(403,);
  });
});

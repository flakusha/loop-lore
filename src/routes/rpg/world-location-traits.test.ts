/**
 * World & Location Traits Routes tests.
 *
 * Mounts the world & location trait routes behind a stub auth middleware and
 * exercises world/location trait CRUD + aggregate over a real test DB.
 * Verifies actor-ownership gating (403 for non-owners).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertLocations, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { worldLocationTraitsRoutes, } from "./world-location-traits";

const mockDb = {} as any;

describe("worldLocationTraitsRoutes", () => {
  test("exports function", () => {
    expect(typeof worldLocationTraitsRoutes,).toBe("function",);
  });

  test("returns Elysia plugin", () => {
    const plugin = worldLocationTraitsRoutes({ database: mockDb, config: {} as never, },);
    expect(plugin,).toBeDefined();
  });
});

describe("world & location traits (auth-gated)", () => {
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
      "Traitsmith",
      { id: userId, role: "solo", status: "active", settings: "{}", } as never,
    );
    worldId = uid();
    await insertWorlds(db, userId, "Trait World", { id: worldId, } as never,);
    actorId = uid();
    await insertActors(db, "Trait Actor", { id: actorId, owner_id: userId, } as never,);
    locationId = uid();
    await insertLocations(db, worldId, "Trait Location", { id: locationId, } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  /**
   * @param actingUserId
   */
  function authedApp(actingUserId: string = userId,): Elysia {
    return new Elysia({ name: "test-traits-auth", },)
      .derive({ as: "scoped", }, (_ctx,) => ({ userId: actingUserId, userRole: "user", }),)
      .use(worldLocationTraitsRoutes({ database: db, config: {} as never, },),) as any;
  }

  /**
   * @param res
   */
  async function json(res: Response,): Promise<unknown> {
    return res.json() as unknown;
  }

  /**
   * @param body
   */
  function readId(body: unknown,): string {
    if (typeof body === "object" && body !== null && "id" in body && typeof body.id === "string") {
      return body.id;
    }
    throw new Error("response missing string id",);
  }

  test("create world trait", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/world-location-traits/worlds/${worldId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          actor_id: actorId,
          world_id: worldId,
          trait_category: "magical",
          trait_name: "Mana-Rich",
          trait_value: "high",
        },),
      },),
    );
    expect(res.status,).toBe(201,);
    expect(readId(await json(res,),),).toBeString();
  });

  test("list world traits", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/world-location-traits/worlds/${worldId}?actorId=${actorId}`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await json(res,)) as { traits?: unknown[] };
    expect(Array.isArray(body.traits,),).toBe(true,);
    expect(body.traits!.length,).toBeGreaterThanOrEqual(1,);
  });

  test("create and update location trait", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/world-location-traits/locations/${locationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          actor_id: actorId,
          location_id: locationId,
          trait_name: "Haunted",
          trait_value: "true",
        },),
      },),
    );
    expect(res.status,).toBe(201,);
    const id = readId(await json(res,),);

    const upRes = await app.handle(
      new Request(`http://localhost/api/rpg/world-location-traits/location/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ bonus: 5, },),
      },),
    );
    expect(upRes.status,).toBe(200,);
  });

  test("list location traits", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/world-location-traits/locations/${locationId}?actorId=${actorId}`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await json(res,)) as { traits?: unknown[] };
    expect(Array.isArray(body.traits,),).toBe(true,);
    expect(body.traits!.length,).toBeGreaterThanOrEqual(1,);
  });

  test("get all traits for actor", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/world-location-traits/actors/${actorId}`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await json(res,)) as { worldTraits?: unknown[]; locationTraits?: unknown[] };
    expect(Array.isArray(body.worldTraits,),).toBe(true,);
    expect(Array.isArray(body.locationTraits,),).toBe(true,);
  });

  test("rejects non-owner actor access with 403", async () => {
    const otherUserId = uid();
    const app = authedApp(otherUserId,);
    const res = await app.handle(
      new Request(`http://localhost/api/rpg/world-location-traits/worlds/${worldId}?actorId=${actorId}`,),
    );
    expect(res.status,).toBe(403,);
  });
});

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Stat allocation + trait catalog route tests.
 *
 * Mounts the routes behind the derive-auth harness with a real test DB:
 * GET read (200 / 404), PUT validation (422) + roundtrip, catalog scope.
 */
import { beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { statAllocationRoutes, } from "./stat-allocation";
import { traitCatalogRoutes, } from "./trait-catalog";

const STATS = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8, };

function makeAllocationApp(db: Kysely<DB>, userId?: string,) {
  const app = new Elysia({ name: "test-stat-allocation", },);
  if (userId) {
    app.derive(() => ({ userId, userRole: "user", }));
  }

  return app.use(statAllocationRoutes({ database: db, config: {} as never, },),);
}

function makeCatalogApp(db: Kysely<DB>, userId?: string,) {
  const app = new Elysia({ name: "test-trait-catalog", },);
  if (userId) {
    app.derive(() => ({ userId, userRole: "user", }));
  }

  return app.use(traitCatalogRoutes({ database: db, config: {} as never, },),);
}

describe("stat allocation routes", () => {
  let db: Kysely<DB>;
  let userId: string;
  let actorId: string;
  let otherActorId: string;
  let worldId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    userId = crypto.randomUUID();
    await insertUsers(db, `alloc-route-${userId}`, "Alloc Route", { id: userId, } as never,);
    worldId = await insertWorlds(db, userId, "Alloc Route World", {
      requires_stats: 1,
      stat_point_budget: 27,
      stat_min: 8,
      stat_max: 15,
    },);

    actorId = await insertActors(db, "Alloc Route Actor", { owner_id: userId, },);
    otherActorId = await insertActors(db, "Alloc Route Other", { owner_id: userId, },);
  },);

  test("GET returns 404 when absent", async () => {
    const res = await makeAllocationApp(db, userId,).handle(
      new Request(`http://localhost/api/rpg/stat-allocation/${otherActorId}`,),
    );

    expect(res.status,).toBe(404,);
  });

  test("PUT persists then GET reads back", async () => {
    const put = await makeAllocationApp(db, userId,).handle(
      new Request(`http://localhost/api/rpg/stat-allocation/${actorId}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ worldId, stats: STATS, traitIds: ["fast_reflexes",], },),
      },),
    );

    expect(put.status,).toBe(200,);
    const get = await makeAllocationApp(db, userId,).handle(
      new Request(`http://localhost/api/rpg/stat-allocation/${actorId}`,),
    );

    expect(get.status,).toBe(200,);
    const body = (await get.json()) as { stats: typeof STATS; traitIds: string[] };
    expect(body.stats,).toEqual(STATS,);
    expect(body.traitIds,).toEqual(["fast_reflexes",],);
  });

  test("PUT rejects budget overflow (422)", async () => {
    const over = { str: 15, dex: 15, con: 15, int: 15, wis: 15, cha: 15, };
    const res = await makeAllocationApp(db, userId,).handle(
      new Request(`http://localhost/api/rpg/stat-allocation/${actorId}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ worldId, stats: over, traitIds: [], },),
      },),
    );

    expect(res.status,).toBe(422,);
  });

  test("routes require auth (401)", async () => {
    const res = await makeAllocationApp(db,).handle(
      new Request(`http://localhost/api/rpg/stat-allocation/${actorId}`,),
    );

    expect(res.status,).toBe(401,);
  });

  test("GET stat-config returns world bounds + cost table (custom world)", async () => {
    const customId = await insertWorlds(db, userId, "Custom Stat World", {
      requires_stats: 1,
      stat_point_budget: 20,
      stat_min: 6,
      stat_max: 14,
    },);

    const res = await makeAllocationApp(db, userId,).handle(
      new Request(`http://localhost/api/rpg/stat-config?worldId=${customId}`,),
    );

    expect(res.status,).toBe(200,);
    const body = (await res.json()) as {
      statPointBudget: number;
      statMin: number;
      statMax: number;
      pointBuyCost: Record<string, number>;
    };

    expect(body.statPointBudget,).toBe(20,);
    expect(body.statMin,).toBe(6,);
    expect(body.statMax,).toBe(14,);
    expect(body.pointBuyCost["15"],).toBe(9,);
  });

  test("GET stat-config 404s unknown world, 401s unauthenticated", async () => {
    const missing = await makeAllocationApp(db, userId,).handle(
      new Request("http://localhost/api/rpg/stat-config?worldId=nope",),
    );

    expect(missing.status,).toBe(404,);
    const anon = await makeAllocationApp(db,).handle(
      new Request(`http://localhost/api/rpg/stat-config?worldId=${worldId}`,),
    );

    expect(anon.status,).toBe(401,);
  });
});

describe("trait catalog route", () => {
  let db: Kysely<DB>;
  let userId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    userId = crypto.randomUUID();
    await insertUsers(db, `catalog-route-${userId}`, "Catalog Route", { id: userId, } as never,);
  },);

  test("returns universal traits for any world, scoped for shadowfell", async () => {
    const app = makeCatalogApp(db, userId,);
    const anyRes = await app.handle(new Request("http://localhost/api/rpg/trait-catalog?worldId=anywhere",),);
    expect(anyRes.status,).toBe(200,);
    const anyTraits = (await anyRes.json()) as { id: string; scope: string }[];
    expect(anyTraits.length,).toBeGreaterThan(0,);
    expect(anyTraits.every((trait,) => trait.scope === "universal"),).toBe(true,);
    const shadowRes = await app.handle(new Request("http://localhost/api/rpg/trait-catalog?worldId=shadowfell",),);
    const shadowTraits = (await shadowRes.json()) as { id: string; scope: string }[];
    expect(shadowTraits.some((trait,) => trait.id === "shadow_step" && trait.scope === "world"),).toBe(true,);
  });

  test("requires auth (401)", async () => {
    const res = await makeCatalogApp(db,).handle(
      new Request("http://localhost/api/rpg/trait-catalog?worldId=x",),
    );

    expect(res.status,).toBe(401,);
  });
});

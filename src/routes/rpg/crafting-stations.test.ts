// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Crafting Routes Tests — station CRUD + craft execution. */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActorItems,
  insertActors,
  insertCraftingRecipeMaterials,
  insertCraftingRecipes,
  insertItems,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { craftingExecutionRoutes, } from "./crafting-execution";
import { craftingStationRoutes, } from "./crafting-stations";

const W = "00000000-0000-4000-8000-100000000001";
const U = "user-owner";
const U2 = "user-other";
const A = "00000000-0000-4000-8000-200000000001";
const ORE = "00000000-0000-4000-8000-300000000001";
const SWORD = "00000000-0000-4000-8000-300000000002";
const RCP = "00000000-0000-4000-8000-400000000001";
const NOW = new Date().toISOString();

function app(db: Kysely<DB>, uid?: string,) {
  const e = new Elysia({ name: "test", },);
  if (uid) { e.derive(() => ({ userId: uid, userRole: "user", })); }
  return e.use(craftingStationRoutes({ database: db, config: {} as never, },),)
    .use(craftingExecutionRoutes({ database: db, config: {} as never, },),);
}

function post(url: string, body: unknown,) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", },
    body: JSON.stringify(body,),
  },);
}

function patch(url: string, body: unknown,) {
  return new Request(url, {
    method: "PATCH",
    headers: { "content-type": "application/json", },
    body: JSON.stringify(body,),
  },);
}

describe("Crafting routes", () => {
  let db: Kysely<DB>;
  let sqlite: Database;
  let defId: string;
  let instId: string;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: U as never, },);
    await insertUsers(db, "other", "Other", { id: U2 as never, },);
    await insertWorlds(db, U, "World", { id: W as never, rpg_enabled: 1 as never, },);
    await insertActors(db, "Hero", { id: A as never, user_id: U, },);
    await insertItems(db, W, "Iron Ore", "material", { id: ORE as never, value: 5 as never, },);
    await insertItems(db, W, "Iron Sword", "weapon", { id: SWORD as never, value: 50 as never, },);
    await insertActorItems(db, A, "Iron Ore", "material", { quantity: 10 as never, value: 5 as never, },);
    await insertCraftingRecipes(db, W, "Sword", "smithing", SWORD, NOW, NOW, {
      id: RCP as never,
      base_success_chance: 1 as never,
      output_quantity: 1 as never,
      station_type_required: "anvil",
    },);
    await insertCraftingRecipeMaterials(db, RCP, ORE, NOW, { quantity: 2 as never, },);
  },);

  afterAll(() => sqlite.close());

  // ── Station definitions ──────────────────────────────

  test("GET stations returns empty", async () => {
    const r = await app(db, U,).handle(
      new Request(`http://localhost/api/rpg/crafting/stations?worldId=${W}`,),
    );
    expect(r.status,).toBe(200,);
    expect((await r.json() as { data: unknown[] }).data,).toHaveLength(0,);
  });

  test("POST stations auth + ownership", async () => {
    const noAuth = await app(db,).handle(
      post("http://localhost/api/rpg/crafting/stations", {
        name: "Anvil",
        worldId: W,
        stationType: "anvil",
      },),
    );
    expect(noAuth.status,).toBe(401,);
    const wrong = await app(db, U2,).handle(
      post("http://localhost/api/rpg/crafting/stations", {
        name: "Anvil",
        worldId: W,
        stationType: "anvil",
      },),
    );
    expect(wrong.status,).toBe(403,);
  });

  test("POST → GET → PATCH → DELETE station def", async () => {
    const cr = await app(db, U,).handle(
      post("http://localhost/api/rpg/crafting/stations", {
        name: "Iron Anvil",
        worldId: W,
        stationType: "anvil",
        tier: 2,
      },),
    );
    expect(cr.status,).toBe(201,);
    defId = (await cr.json() as { id: string }).id;

    const get = await app(db, U,).handle(
      new Request(`http://localhost/api/rpg/crafting/stations/${defId}`,),
    );
    expect(get.status,).toBe(200,);
    const g = await get.json() as { name: string; stationType: string };
    expect(g.name,).toBe("Iron Anvil",);
    expect(g.stationType,).toBe("anvil",);

    const up = await app(db, U,).handle(
      patch(`http://localhost/api/rpg/crafting/stations/${defId}`, {
        name: "Steel Anvil",
        tier: 3,
      },),
    );
    expect(up.status,).toBe(200,);
    expect((await up.json() as { name: string }).name,).toBe("Steel Anvil",);

    const notOwner = await app(db, U2,).handle(
      new Request(`http://localhost/api/rpg/crafting/stations/${defId}`, {
        method: "DELETE",
      },),
    );
    expect(notOwner.status,).toBe(403,);

    const del = await app(db, U,).handle(
      new Request(`http://localhost/api/rpg/crafting/stations/${defId}`, {
        method: "DELETE",
      },),
    );
    expect(del.status,).toBe(200,);
    expect((await del.json() as { deleted: boolean }).deleted,).toBe(true,);
  });

  test("GET stations/:id 404 for missing", async () => {
    const r = await app(db, U,).handle(
      new Request("http://localhost/api/rpg/crafting/stations/00000000-0000-4000-8000-999999999999",),
    );
    expect(r.status,).toBe(404,);
  });

  // ── Station instances ────────────────────────────────

  test("POST → GET → PATCH → DELETE station instance", async () => {
    // Re-create def for instance tests
    const crDef = await app(db, U,).handle(
      post("http://localhost/api/rpg/crafting/stations", {
        name: "Anvil 2",
        worldId: W,
        stationType: "anvil",
        maxDurability: 200,
      },),
    );
    const dId = (await crDef.json() as { id: string }).id;

    const cr = await app(db, U,).handle(
      post("http://localhost/api/rpg/crafting/station-instances", {
        stationDefId: dId,
        worldId: W,
      },),
    );
    expect(cr.status,).toBe(201,);
    instId = (await cr.json() as { id: string }).id;

    const list = await app(db, U,).handle(
      new Request(`http://localhost/api/rpg/crafting/station-instances?worldId=${W}`,),
    );
    expect(list.status,).toBe(200,);
    expect((await list.json() as { data: { id: string }[] }).data
      .some(i => i.id === instId),).toBe(true,);

    const up = await app(db, U,).handle(
      patch(`http://localhost/api/rpg/crafting/station-instances/${instId}`, {
        isActive: false,
      },),
    );
    expect(up.status,).toBe(200,);
    expect((await up.json() as { isActive: boolean }).isActive,).toBe(false,);

    const noDel = await app(db, U2,).handle(
      new Request(`http://localhost/api/rpg/crafting/station-instances/${instId}`, {
        method: "DELETE",
      },),
    );
    expect(noDel.status,).toBe(403,);

    const del = await app(db, U,).handle(
      new Request(`http://localhost/api/rpg/crafting/station-instances/${instId}`, {
        method: "DELETE",
      },),
    );
    expect(del.status,).toBe(200,);
  });

  // ── Craft execution ──────────────────────────────────

  test("POST /craft auth + ownership + not found", async () => {
    const noAuth = await app(db,).handle(
      post("http://localhost/api/rpg/craft", { actorId: A, recipeId: RCP, },),
    );
    expect(noAuth.status,).toBe(401,);
    const wrong = await app(db, U2,).handle(
      post("http://localhost/api/rpg/craft", { actorId: A, recipeId: RCP, },),
    );
    expect(wrong.status,).toBe(403,);
    const missing = await app(db, U,).handle(
      post("http://localhost/api/rpg/craft", {
        actorId: A,
        recipeId: "00000000-0000-4000-8000-999999999999",
      },),
    );
    expect(missing.status,).toBe(404,);
  });

  test("POST /craft success with materials", async () => {
    // Create a fresh station instance for craft tests
    const crDef = await app(db, U,).handle(
      post("http://localhost/api/rpg/crafting/stations", {
        name: "Craft Anvil",
        worldId: W,
        stationType: "anvil",
      },),
    );
    const dId = (await crDef.json() as { id: string }).id;
    const crInst = await app(db, U,).handle(
      post("http://localhost/api/rpg/crafting/station-instances", {
        stationDefId: dId,
        worldId: W,
      },),
    );
    const sId = (await crInst.json() as { id: string }).id;

    const r = await app(db, U,).handle(
      post("http://localhost/api/rpg/craft", {
        actorId: A,
        recipeId: RCP,
        stationInstanceId: sId,
      },),
    );
    expect(r.status,).toBe(200,);
    const body = await r.json() as {
      status: string;
      outputItemId: string | null;
      materialsConsumed: { quantity: number }[];
    };
    expect(["success", "critical_success",],).toContain(body.status,);
    expect(body.outputItemId,).toBe(SWORD,);
    expect(body.materialsConsumed[0]!.quantity,).toBe(2,);
  });

  test("POST /craft fails when materials insufficient", async () => {
    // Create station for drain crafts
    const crDef = await app(db, U,).handle(
      post("http://localhost/api/rpg/crafting/stations", {
        name: "Drain Anvil",
        worldId: W,
        stationType: "anvil",
      },),
    );
    const dId = (await crDef.json() as { id: string }).id;
    const crInst = await app(db, U,).handle(
      post("http://localhost/api/rpg/crafting/station-instances", {
        stationDefId: dId,
        worldId: W,
      },),
    );
    const sId = (await crInst.json() as { id: string }).id;
    // Actor started with 10 ore, used 2 in prior test → 8 left.
    // Drain remaining: 4 more crafts × 2 = 8 ore.
    for (let i = 0; i < 4; i++) {
      await app(db, U,).handle(
        post("http://localhost/api/rpg/craft", {
          actorId: A,
          recipeId: RCP,
          stationInstanceId: sId,
        },),
      );
    }
    const r = await app(db, U,).handle(
      post("http://localhost/api/rpg/craft", {
        actorId: A,
        recipeId: RCP,
        stationInstanceId: sId,
      },),
    );
    expect(r.status,).toBe(400,);
    expect((await r.json() as { error: string }).error,).toContain("Insufficient",);
  });
});

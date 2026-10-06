// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the admin item power-audit route (TASK-056).
 *
 * Covers auth, `?limit=` parsing, and the ranked payload produced by
 * `rankItemPower` over persisted `world_items` rows.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { ItemCategory, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertItems, insertUsers, insertWorldItems, insertWorlds, } from "../../test-utils/insert-helpers";
import { itemPowerRoutes, } from "./item-power";

/**
 * @param db
 * @param userRole
 */
function makeApp(db: Kysely<DB>, userRole: string | null,) {
  const app = new Elysia({ name: "test-item-power", },);
  app.derive((): { userId: string | null; userRole: string | null } => ({
    userId: userRole ? `test-user-${userRole}` : null,
    userRole,
  }));

  return app.use(itemPowerRoutes({ database: db, config: {} as Config, }, "/api",),);
}

let db: Kysely<DB>;
let sqlite: TestDb["sqlite"];
const TEST_USER = "00000000-0000-0000-0000-000000000060";
const TEST_WORLD = "00000000-0000-0000-0000-000000000061";
const EMPTY_WORLD = "00000000-0000-0000-0000-000000000062";

beforeAll(async () => {
  const tdb = await createTestDb();
  db = tdb.db;
  sqlite = tdb.sqlite;
  await insertUsers(db, "wren", "Wren", { id: TEST_USER, },);
  await insertWorlds(db, TEST_USER, "Eldoria", { id: TEST_WORLD, },);
  await insertWorlds(db, TEST_USER, "Empty Realm", { id: EMPTY_WORLD, },);

  const swordId = await insertItems(db, TEST_WORLD, "Sword", ItemCategory.Weapon, {
    properties: JSON.stringify({ effects: [{ kind: "stat_delta", stat: "damage", amount: 5, },], },),
  },);

  await insertWorldItems(db, TEST_WORLD, swordId, { max_durability: 50, },);

  const potionId = await insertItems(db, TEST_WORLD, "Potion", ItemCategory.Consumable, {
    properties: JSON.stringify({ effects: [{ kind: "stat_delta", stat: "heal", amount: 1, },], },),
  },);

  await insertWorldItems(db, TEST_WORLD, potionId, {
    max_durability: 2,
    properties: JSON.stringify({ drift: { statMultipliers: { damage: 0.3, }, }, },),
  },);
},);

afterAll(() => {
  sqlite.close();
},);

describe("admin item power-audit route", () => {
  test("returns 401 for anonymous", async () => {
    const res = await makeApp(db, null,).handle(
      new Request(`http://localhost/api/admin/worlds/${TEST_WORLD}/items/power-audit`,),
    );

    expect(res.status,).toBe(401,);
  });

  test("returns 403 for non-admin", async () => {
    const res = await makeApp(db, "user",).handle(
      new Request(`http://localhost/api/admin/worlds/${TEST_WORLD}/items/power-audit`,),
    );

    expect(res.status,).toBe(403,);
  });

  test("ranks items by power, strongest first", async () => {
    const res = await makeApp(db, "admin",).handle(
      new Request(`http://localhost/api/admin/worlds/${TEST_WORLD}/items/power-audit`,),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as {
      worldId: string;
      limit: number;
      items: { name: string; score: number; maxStatDelta: number; drift: number; maxDurability: number }[];
    };

    expect(body.worldId,).toBe(TEST_WORLD,);
    expect(body.limit,).toBe(20,);
    expect(body.items.map((i,) => i.name),).toEqual(["Sword", "Potion",],);
    expect(body.items[0],).toMatchObject({ maxStatDelta: 5, drift: 0, maxDurability: 50, score: 55, },);
    expect(body.items[1],).toMatchObject({ maxStatDelta: 1, drift: 0.3, maxDurability: 2, score: 3.3, },);
  });

  test("returns an empty list for a world with no items", async () => {
    const res = await makeApp(db, "admin",).handle(
      new Request(`http://localhost/api/admin/worlds/${EMPTY_WORLD}/items/power-audit`,),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as { items: unknown[] };
    expect(body.items,).toEqual([],);
  });

  test("applies ?limit= and falls back to the default on bad input", async () => {
    const app = makeApp(db, "admin",);
    const url = `http://localhost/api/admin/worlds/${TEST_WORLD}/items/power-audit`;
    const limited = await app.handle(new Request(`${url}?limit=1`,),);
    expect((await limited.json() as { items: unknown[] }).items.length,).toBe(1,);
    for (const raw of ["abc", "0", "-3", "", "500",]) {
      const res = await app.handle(new Request(`${url}?limit=${raw}`,),);
      const body = await res.json() as { limit: number };
      expect(body.limit,).toBe(raw === "500" ? 200 : 20,);
    }
  });

  test("rejects a non-uuid world id with 422", async () => {
    const res = await makeApp(db, "admin",).handle(
      new Request("http://localhost/api/admin/worlds/not-a-uuid/items/power-audit",),
    );

    expect(res.status,).toBe(422,);
  });
});

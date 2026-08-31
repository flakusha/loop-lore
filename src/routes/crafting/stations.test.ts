// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for crafting station definitions and instances.
 *
 * Builds a minimal real SQLite database (the exact columns the StationsService
 * reads/writes), seeds a world owned by a test user, then exercises the full
 * CRUD surface for station definitions and their placed instances over the real
 * Elysia HTTP handler (`app.handle`).
 *
 * The repo-wide `createTestDb` helper is intentionally avoided here because it
 * applies every migration, and migration `048_battle_equipment_durability`
 * generates ALTER TABLE SQL that SQLite rejects — that break is orthogonal to
 * these routes and would prevent the suite from booting. The schema below
 * covers precisely the tables these routes touch.
 */
import { Database, } from "bun:sqlite";
import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { Db, } from "../../db";
import { createSqliteDialect, } from "../../db/index";
import { craftingStationRoutes, } from "./stations";

const TEST_USER = randomUUID();
const WORLD_ID = randomUUID();
const BASE = `http://localhost/api/worlds/${WORLD_ID}/crafting-stations`;

/** Build a minimal in-memory DB with the tables these routes depend on. */
async function makeDb(): Promise<{ db: Db; sqlite: Database }> {
  const sqlite = new Database(":memory:",);
  sqlite.run("PRAGMA foreign_keys = ON",);
  sqlite.run(
    `CREATE TABLE users (
      id text primary key,
      username text not null,
      display_name text not null,
      role text not null,
      status text not null,
      settings text not null
    )`,
  );
  sqlite.run(
    `CREATE TABLE worlds (
      id text primary key,
      owner_id text not null,
      name text not null,
      description text,
      lore text,
      publication_status text not null default 'draft',
      kind text not null default 'rpg',
      visibility text not null default 'private',
      scan_depth integer not null default 100,
      token_budget integer not null default 2000,
      difficulty_modifier real not null default 1,
      difficulty_reroll text not null default 'none',
      difficulty_state text not null default 'alive',
      created_at text not null default (datetime('now')),
      updated_at text not null default (datetime('now')),
      nsfw_override text,
      rpg_enabled integer not null default 0
    )`,
  );
  sqlite.run(
    `CREATE TABLE crafting_station_defs (
      id text primary key,
      world_id text not null references worlds(id),
      name text not null,
      description text,
      station_type text not null,
      tier integer not null default 1,
      speed_bonus real not null default 0,
      quality_bonus real not null default 0,
      success_bonus real not null default 0,
      material_saving_chance real not null default 0,
      max_durability integer not null default 100,
      created_at text not null,
      updated_at text not null
    )`,
  );
  sqlite.run(
    `CREATE TABLE crafting_station_instances (
      id text primary key,
      station_def_id text not null references crafting_station_defs(id),
      world_id text not null references worlds(id),
      location_id text,
      owner_actor_id text,
      current_durability real not null,
      is_active integer not null default 1,
      created_at text not null,
      updated_at text not null
    )`,
  );
  const db = new Kysely<import("../../db/schema").DB>({ dialect: createSqliteDialect(sqlite,), },);
  return { db, sqlite, };
}

/**
 * Build the route app with a fixed test identity injected into context.
 * @param db
 */
function makeApp(db: Db,) {
  return new Elysia()
    .derive(() => ({ userId: TEST_USER, }))
    .use(craftingStationRoutes({ database: db, },),);
}

describe("craftingStationRoutes", () => {
  test("exports factory", () => {
    expect(typeof craftingStationRoutes,).toBe("function",);
  });

  test("station def + instance CRUD lifecycle", async () => {
    const { db, sqlite, } = await makeDb();

    // Seed the owning user (worlds.owner_id → users.id FK) and the world.
    await db.insertInto("users",).values({
      id: TEST_USER,
      username: "station-tester",
      display_name: "Station Tester",
      role: "user",
      status: "active",
      settings: "{}",
    },).execute();
    await db.insertInto("worlds",).values({
      id: WORLD_ID,
      owner_id: TEST_USER,
      name: "Station Test World",
      description: null,
    },).execute();

    const app = makeApp(db,);

    // ── Definitions ───────────────────────────────────────────
    const createRes = await app.handle(
      new Request(BASE, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({
          name: "Test Anvil",
          description: "A sturdy anvil",
          stationType: "anvil",
          tier: 2,
          speedBonus: 10,
          qualityBonus: 5,
          successBonus: 1,
          materialSavingChance: 2,
          maxDurability: 200,
        },),
      },),
    );
    expect(createRes.status,).toBe(201,);
    const created = await createRes.json() as { id: string };
    expect(created.id,).toBeTruthy();
    const defId = created.id;

    const getRes = await app.handle(new Request(`${BASE}/${defId}`,),);
    expect(getRes.status,).toBe(200,);
    const got = await getRes.json() as Record<string, unknown>;
    expect(got.name,).toBe("Test Anvil",);
    expect(got.stationType,).toBe("anvil",);
    expect(got.tier,).toBe(2,);

    const listRes = await app.handle(new Request(BASE,),);
    expect(listRes.status,).toBe(200,);
    const listed = await listRes.json() as { stationDefs: unknown[] };
    expect(listed.stationDefs,).toHaveLength(1,);

    const updRes = await app.handle(
      new Request(`${BASE}/${defId}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ name: "Renamed Anvil", tier: 3, },),
      },),
    );
    expect(updRes.status,).toBe(200,);
    expect((await updRes.json() as { ok: boolean }).ok,).toBe(true,);

    const getRes2 = await app.handle(new Request(`${BASE}/${defId}`,),);
    const got2 = await getRes2.json() as Record<string, unknown>;
    expect(got2.name,).toBe("Renamed Anvil",);
    expect(got2.tier,).toBe(3,);

    // ── Instances ─────────────────────────────────────────────
    const instRes = await app.handle(
      new Request(`${BASE}/${defId}/instances`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ currentDurability: 100, isActive: true, },),
      },),
    );
    expect(instRes.status,).toBe(201,);
    const instCreated = await instRes.json() as { id: string };
    expect(instCreated.id,).toBeTruthy();
    const instId = instCreated.id;

    const listInst = await app.handle(new Request(`${BASE}/${defId}/instances`,),);
    expect(listInst.status,).toBe(200,);
    const listedInst = await listInst.json() as { instances: unknown[] };
    expect(listedInst.instances,).toHaveLength(1,);

    const getInst = await app.handle(new Request(`${BASE}/${defId}/instances/${instId}`,),);
    expect(getInst.status,).toBe(200,);
    const gotInst = await getInst.json() as Record<string, unknown>;
    expect(gotInst.currentDurability,).toBe(100,);
    expect(gotInst.isActive,).toBe(true,);

    const updInst = await app.handle(
      new Request(`${BASE}/${defId}/instances/${instId}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ currentDurability: 50, isActive: false, },),
      },),
    );
    expect(updInst.status,).toBe(200,);

    const getInst2 = await app.handle(new Request(`${BASE}/${defId}/instances/${instId}`,),);
    const gotInst2 = await getInst2.json() as Record<string, unknown>;
    expect(gotInst2.currentDurability,).toBe(50,);
    expect(gotInst2.isActive,).toBe(false,);

    const delInst = await app.handle(
      new Request(`${BASE}/${defId}/instances/${instId}`, {
        method: "DELETE",
      },),
    );
    expect(delInst.status,).toBe(200,);

    const getInst3 = await app.handle(new Request(`${BASE}/${defId}/instances/${instId}`,),);
    expect(getInst3.status,).toBe(404,);

    // ── Delete definition ─────────────────────────────────────
    const delDef = await app.handle(
      new Request(`${BASE}/${defId}`, {
        method: "DELETE",
      },),
    );
    expect(delDef.status,).toBe(200,);

    const getDef3 = await app.handle(new Request(`${BASE}/${defId}`,),);
    expect(getDef3.status,).toBe(404,);

    await db.destroy();
    sqlite.close();
  });

  test("rejects requests for a world the user does not own", async () => {
    const { db, sqlite, } = await makeDb();
    await db.insertInto("users",).values({
      id: TEST_USER,
      username: "station-tester-2",
      display_name: "Station Tester 2",
      role: "user",
      status: "active",
      settings: "{}",
    },).execute();
    // World owned by a *different* user.
    await db.insertInto("worlds",).values({
      id: WORLD_ID,
      owner_id: randomUUID(),
      name: "Other World",
      description: null,
    },).execute();

    const app = makeApp(db,);
    const res = await app.handle(
      new Request(BASE, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ name: "x", stationType: "forge", },),
      },),
    );
    expect(res.status,).toBe(403,);

    await db.destroy();
    sqlite.close();
  });
});

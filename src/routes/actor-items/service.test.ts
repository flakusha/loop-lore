// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for actor-items gameplay endpoints.
 *
 * Exercises the equip/unequip/equipped/carry/transfer routes over the real
 * Elysia HTTP handler (`app.handle`) on a minimal in-memory SQLite schema.
 * Verifies ownership gating, success, and the failure shapes surfaced by the
 * `ActorItemsService`.
 */
import { Database, } from "bun:sqlite";
import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { Db, } from "../../db";
import { EquipState, ItemCategory, } from "../../db/enums";
import { createSqliteDialect, } from "../../db/index";
import { actorItemsGameplayRoutes, } from "./service";

const OWNER = randomUUID();
const STRANGER = randomUUID();
const ACTOR = randomUUID();
const BASE = `http://localhost/api/actors/${ACTOR}/items`;

/** Build a minimal DB with `users`, `actors`, `actor_items` tables. */
async function makeDb(): Promise<Db> {
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
    `CREATE TABLE actors (
      id text primary key,
      actor_type text not null default 'user',
      display_name text not null,
      user_id text references users(id),
      owner_id text references users(id),
      avatar_asset_id text,
      description text,
      system_prompt text,
      agent_type text not null default 'none',
      settings text not null default '{}',
      format_version integer not null default 0,
      visibility text not null default 'private',
      welcome_message text,
      personality text,
      scenario text,
      mes_example text,
      alternate_greetings text,
      post_history_instructions text,
      creator_notes text,
      creator text,
      character_version text,
      import_spec text not null default 'raw',
      created_at text not null default (datetime('now')),
      updated_at text not null default (datetime('now')),
      content_rating text not null default 'sfw',
      template_overrides text not null default '{}',
      data_source_format text default 'json',
      data_raw text,
      agent_role text,
      growth_mode text not null default 'dynamic',
      llm_assist_enabled integer not null default 0
    )`,
  );
  sqlite.run(
    `CREATE TABLE actor_items (
      id text primary key,
      actor_id text not null references actors(id),
      name text not null,
      description text,
      item_type text not null,
      quantity integer not null default 1,
      value integer not null default 0,
      weight real,
      tags text default '[]',
      metadata text default '{}',
      equipped text not null default 'unequipped',
      sort_order integer not null default 0,
      created_at text not null default (datetime('now')),
      updated_at text not null default (datetime('now')),
      durability integer not null default 100,
      max_durability integer not null default 100
    )`,
  );
  return new Kysely<import("../../db/schema").DB>({ dialect: createSqliteDialect(sqlite,), },);
}

/** Seed the owning user, a stranger, and the actor owned by the test user. */
async function seed(db: Db,): Promise<void> {
  for (const u of [{ id: OWNER, username: "owner", }, { id: STRANGER, username: "stranger", },]) {
    await db.insertInto("users",).values({
      id: u.id,
      username: u.username,
      display_name: u.username,
      role: "user",
      status: "active",
      settings: "{}",
    },).execute();
  }
  await db.insertInto("actors",).values({
    id: ACTOR,
    display_name: "Hero",
    user_id: OWNER,
    owner_id: OWNER,
    settings: '{"strength":10}',
  },).execute();
}

/** Build the route app with the supplied identity injected into ctx. */
function makeApp(db: Db, userId: string | null,): Elysia {
  const app = new Elysia();
  if (userId) {
    app.derive(() => ({ userId, }));
  }
  return app.use(actorItemsGameplayRoutes({ database: db, },),);
}

/** Insert a basic actor item row. */
async function insertItem(
  db: Db,
  opts: { id?: string; name?: string; type: ItemCategory; equipped?: EquipState; quantity?: number },
): Promise<string> {
  const id = opts.id ?? randomUUID();
  await db.insertInto("actor_items",).values({
    id,
    actor_id: ACTOR,
    name: opts.name ?? "Sword",
    description: null,
    item_type: opts.type,
    quantity: opts.quantity ?? 1,
    value: 0,
    weight: 1,
    tags: "[]",
    metadata: "{}",
    equipped: opts.equipped ?? EquipState.Unequipped,
    sort_order: 0,
    durability: 100,
    max_durability: 100,
  },).execute();
  return id;
}

describe("actorItemsGameplayRoutes", () => {
  test("exports factory", () => {
    expect(typeof actorItemsGameplayRoutes,).toBe("function",);
  });

  test("returns 401 when caller has no userId", async () => {
    const db = await makeDb();
    await seed(db,);
    const app = makeApp(db, null,);
    const res = await app.handle(new Request(`${BASE}/equipped`,),);
    expect(res.status,).toBe(401,);
  });

  test("returns 404 when actor does not exist for the caller", async () => {
    const db = await makeDb();
    // Seed users only — no actor row.
    await db.insertInto("users",).values({
      id: OWNER,
      username: "owner",
      display_name: "Owner",
      role: "user",
      status: "active",
      settings: "{}",
    },).execute();
    const app = makeApp(db, OWNER,);
    const res = await app.handle(new Request(`${BASE}/equipped`,),);
    expect(res.status,).toBe(404,);
  });

  test("returns 403 when actor belongs to a different user", async () => {
    const db = await makeDb();
    await seed(db,);
    const app = makeApp(db, STRANGER,);
    const res = await app.handle(new Request(`${BASE}/equipped`,),);
    expect(res.status,).toBe(403,);
  });

  test("equip + unequip round-trip on the same item", async () => {
    const db = await makeDb();
    await seed(db,);
    const itemId = await insertItem(db, { type: ItemCategory.Weapon, name: "Iron Sword", },);
    const app = makeApp(db, OWNER,);

    const equipRes = await app.handle(
      new Request(`${BASE}/${itemId}/equip`, { method: "POST", },),
    );
    expect(equipRes.status,).toBe(200,);
    const equipBody = await equipRes.json() as { ok: boolean };
    expect(equipBody.ok,).toBe(true,);

    const listRes = await app.handle(new Request(`${BASE}/equipped`,),);
    expect(listRes.status,).toBe(200,);
    const listBody = await listRes.json() as Array<{ id: string }>;
    expect(listBody,).toHaveLength(1,);
    expect(listBody[0]?.id,).toBe(itemId,);

    const unequipRes = await app.handle(
      new Request(`${BASE}/${itemId}/unequip`, { method: "POST", },),
    );
    expect(unequipRes.status,).toBe(200,);
    const unequipBody = await unequipRes.json() as { ok: boolean };
    expect(unequipBody.ok,).toBe(true,);

    const list2Res = await app.handle(new Request(`${BASE}/equipped`,),);
    const list2Body = await list2Res.json() as Array<unknown>;
    expect(list2Body,).toHaveLength(0,);
  });

  test("equip rejects an unknown item with a 400 + reason", async () => {
    const db = await makeDb();
    await seed(db,);
    const app = makeApp(db, OWNER,);
    const res = await app.handle(
      new Request(`${BASE}/${randomUUID()}/equip`, { method: "POST", },),
    );
    expect(res.status,).toBe(400,);
    const body = await res.json() as { error?: string; code?: string };
    expect(body.error,).toBeTruthy();
    expect(body.code,).toBeTruthy();
  });

  test("equip rejects a second weapon in the same weapon slot", async () => {
    const db = await makeDb();
    await seed(db,);
    const first = await insertItem(db, { type: ItemCategory.Weapon, name: "Sword A", },);
    const second = await insertItem(db, { type: ItemCategory.Weapon, name: "Sword B", },);
    const app = makeApp(db, OWNER,);

    const ok = await app.handle(
      new Request(`${BASE}/${first}/equip`, { method: "POST", },),
    );
    expect(ok.status,).toBe(200,);

    const conflict = await app.handle(
      new Request(`${BASE}/${second}/equip`, { method: "POST", },),
    );
    expect(conflict.status,).toBe(400,);
    const body = await conflict.json() as { error?: string };
    expect(body.error,).toMatch(/weapon/i,);
  });

  test("carry reports encumbrance based on weight vs STR-derived capacity", async () => {
    const db = await makeDb();
    await seed(db,);
    await insertItem(db, { type: ItemCategory.Consumable, name: "Heavy Rock", quantity: 1, },);
    // Patch the item's weight post-seed (insert helper doesn't accept weight override).
    await db.updateTable("actor_items",).set({ weight: 1000, },).where("actor_id", "=", ACTOR,).execute();
    const app = makeApp(db, OWNER,);
    const res = await app.handle(new Request(`${BASE}/carry`,),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { carried: number; capacity: number; encumbrance: string };
    expect(body.carried,).toBe(1000,);
    // STR=10 → capacity 50 + 10*10 = 150; ratio 1000/150 > 1 → overloaded.
    expect(body.capacity,).toBe(150,);
    expect(body.encumbrance,).toBe("overloaded",);
  });

  test("transfer moves quantity between actors", async () => {
    const db = await makeDb();
    await seed(db,);
    const secondActor = randomUUID();
    await db.insertInto("actors",).values({
      id: secondActor,
      display_name: "Buddy",
      user_id: OWNER,
      owner_id: OWNER,
      settings: "{}",
    },).execute();
    const itemId = await insertItem(db, { type: ItemCategory.Consumable, name: "Potion", quantity: 3, },);
    const app = makeApp(db, OWNER,);

    const res = await app.handle(
      new Request(`${BASE}/${itemId}/transfer`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ toActorId: secondActor, quantity: 2, },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { ok: boolean; transferred?: number };
    expect(body.ok,).toBe(true,);
    expect(body.transferred,).toBe(2,);

    // Source now has 1; target has 2.
    const sourceRows = await db.selectFrom("actor_items",).selectAll().where("actor_id", "=", ACTOR,).execute();
    const targetRows = await db.selectFrom("actor_items",).selectAll().where("actor_id", "=", secondActor,).execute();
    expect(sourceRows[0]?.quantity,).toBe(1,);
    expect(targetRows[0]?.quantity,).toBe(2,);
  });

  test("transfer rejects non-positive quantity with 400", async () => {
    const db = await makeDb();
    await seed(db,);
    const itemId = await insertItem(db, { type: ItemCategory.Consumable, name: "Potion", quantity: 1, },);
    const app = makeApp(db, OWNER,);

    const res = await app.handle(
      new Request(`${BASE}/${itemId}/transfer`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ toActorId: randomUUID(), quantity: 0, },),
      },),
    );
    expect(res.status,).toBe(400,);
    const body = await res.json() as { error?: string };
    expect(body.error,).toBeTruthy();
  });
});

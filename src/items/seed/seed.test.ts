// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/items/seed/seed.test.ts — Unit tests for item template seeder (idempotency)

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { ItemsConfig, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { mergeItemTemplates, } from "./merge";
import { seedItemTemplates, } from "./templates";

async function countItems(db: Kysely<DB>, name: string,): Promise<number> {
  const rows = await db.selectFrom("items",).select("id",).where("name", "=", name,).execute();
  return rows.length;
}

describe("mergeItemTemplates", () => {
  test("merges built-in defaults with user templates", () => {
    const merged = mergeItemTemplates(
      [{ name: "Default Sword", category: "weapon", },],
      [{ name: "User Sword", category: "weapon", },],
    );

    expect(merged.length,).toBe(2,);
  });

  test("user templates override built-in by name (case-insensitive)", () => {
    const merged = mergeItemTemplates(
      [{ name: "Health Potion", category: "consumable", value: 50, },],
      [{ name: "health potion", category: "consumable", value: 99, },],
    );

    expect(merged.length,).toBe(1,);
    expect(merged[0]?.value,).toBe(99,);
  });
});

describe("seedItemTemplates", () => {
  let db: Kysely<DB>;
  let worldA: string;
  let worldB: string;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, } = await createTestDb());
    await insertUsers(db, "item-seed-owner", "Item Seed Owner", { id: "user-1", },);
    worldA = "seed-world-a";
    worldB = "seed-world-b";
    await db.insertInto("worlds",).values({ id: worldA, name: "World A", owner_id: "user-1", },).execute();
    await db.insertInto("worlds",).values({ id: worldB, name: "World B", owner_id: "user-1", },).execute();
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("seeds item definitions into every world", async () => {
    const config: ItemsConfig = {
      enabled: true,
      templates: [{ name: "Test Blade", category: "weapon", description: "A blade", },],
    };

    const result = await seedItemTemplates(db, config,);
    expect(result,).toEqual({ created: 2, skipped: 0, errors: [], },);
    expect(await countItems(db, "Test Blade",),).toBe(2,);
  });

  test("re-seeding is idempotent — no duplicates", async () => {
    const config: ItemsConfig = {
      enabled: true,
      templates: [{ name: "Test Blade", category: "weapon", description: "A blade", },],
    };

    const result = await seedItemTemplates(db, config,);
    expect(result.created,).toBe(0,);
    expect(result.skipped,).toBe(2,);
    expect(await countItems(db, "Test Blade",),).toBe(2,);
  });

  test("per-world templates seed only the named world", async () => {
    const config: ItemsConfig = {
      enabled: true,
      templates: [{ name: "World B Relic", category: "treasure", world: worldB, },],
    };

    const result = await seedItemTemplates(db, config,);
    expect(result.created,).toBe(1,);
    const rows = await db.selectFrom("items",).select("world_id",).where("name", "=", "World B Relic",).execute();
    expect(rows.map((r,) => r.world_id),).toEqual([worldB,],);
  });

  test("template.world matches by world name too", async () => {
    const config: ItemsConfig = {
      enabled: true,
      templates: [{ name: "World A Relic", category: "key_item", world: "world a", },],
    };

    const result = await seedItemTemplates(db, config,);
    expect(result.created,).toBe(1,);
    const rows = await db.selectFrom("items",).select("world_id",).where("name", "=", "World A Relic",).execute();
    expect(rows.map((r,) => r.world_id),).toEqual([worldA,],);
  });

  test("explicit worldId restricts global templates to that world", async () => {
    const config: ItemsConfig = {
      enabled: true,
      templates: [{ name: "Scoped Blade", category: "weapon", },],
    };

    const result = await seedItemTemplates(db, config, worldA,);
    expect(result.created,).toBe(1,);
    expect(await countItems(db, "Scoped Blade",),).toBe(1,);
  });

  test("disabled section seeds nothing", async () => {
    const config: ItemsConfig = {
      enabled: false,
      templates: [{ name: "Locked Blade", category: "weapon", },],
    };

    const result = await seedItemTemplates(db, config,);
    expect(result,).toEqual({ created: 0, skipped: 0, errors: [], },);
  });

  test("hard id is used for the seeded row", async () => {
    const config: ItemsConfig = {
      enabled: true,
      templates: [{ id: "item-hard-id", name: "Hard Id Ring", category: "treasure", },],
    };

    const result = await seedItemTemplates(db, config, worldA,);
    expect(result.created,).toBe(1,);
    const row = await db.selectFrom("items",).selectAll().where("id", "=", "item-hard-id",).executeTakeFirst();
    expect(row?.name,).toBe("Hard Id Ring",);
  });

  test("defaults apply for optional template fields", async () => {
    const config: ItemsConfig = {
      enabled: true,
      templates: [{ name: "Bare Template", category: "misc", },],
    };

    const result = await seedItemTemplates(db, config, worldB,);
    expect(result.created,).toBe(1,);
    const row = await db.selectFrom("items",).selectAll().where("name", "=", "Bare Template",).executeTakeFirst();
    expect(row?.rarity,).toBe("common",);
    expect(row?.value,).toBe(0,);
    expect(row?.weight,).toBe(0,);
  });
});

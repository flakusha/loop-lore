// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Item definition dedupe tests (TASK-055).
 *
 * `createDefinition` rejects a repeated `(worldId, name, category)` tuple with
 * `DuplicateItemDefinitionError` carrying the existing id, and still allows the
 * same name in a different world or category.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { ItemCategory, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { createDefinition, } from "./definitions";
import { DuplicateItemDefinitionError, } from "./types";
import type { ItemDefinition, ItemState, } from "./types";

let db: Kysely<DB>;
let state: ItemState;
let worldA: string;
let worldB: string;

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, } = await createTestDb());
  state = { db, };
  const userId = uid();
  await insertUsers(db, `user-${userId}`, "Dedupe Owner", { id: userId, } as never,);
  worldA = uid();
  worldB = uid();
  await insertWorlds(db, userId, "Dedupe World A", { id: worldA, } as never,);
  await insertWorlds(db, userId, "Dedupe World B", { id: worldB, } as never,);
},);

afterAll(async () => {
  await db.destroy();
},);

function def(overrides: Partial<ItemDefinition> = {},): ItemDefinition {
  return {
    worldId: worldA,
    name: "Iron Sword",
    description: "A plain sword.",
    category: ItemCategory.Weapon,
    rarity: "common",
    stackable: false,
    maxStack: 1,
    properties: {},
    value: 10,
    weight: 3,
    ...overrides,
  };
}

describe("createDefinition dedupe", () => {
  test("rejects a repeated (worldId, name, category) with the existing id", async () => {
    const name = `Dagger ${uid()}`;
    const first = await createDefinition(state, def({ name, },),);

    let thrown: unknown;
    try {
      await createDefinition(state, def({ name, },),);
    } catch (error) {
      thrown = error;
    }

    expect(thrown,).toBeInstanceOf(DuplicateItemDefinitionError,);
    expect((thrown as DuplicateItemDefinitionError).existingItemId,).toBe(first,);
  });

  test("a rejected duplicate does not insert a second row", async () => {
    const name = `Sceptre ${uid()}`;
    await createDefinition(state, def({ name, category: ItemCategory.Tool, },),);
    await expect(createDefinition(state, def({ name, category: ItemCategory.Tool, },),),).rejects.toThrow(
      DuplicateItemDefinitionError,
    );

    const rows = await db
      .selectFrom("items",)
      .select("id",)
      .where("world_id", "=", worldA,)
      .where("name", "=", name,)
      .execute();

    expect(rows,).toHaveLength(1,);
  });

  test("re-importing the same definition is idempotent (row count unchanged)", async () => {
    const name = `Relic ${uid()}`;
    await createDefinition(state, def({ name, category: ItemCategory.Treasure, },),);
    const before = await db.selectFrom("items",).select("id",).where("world_id", "=", worldA,).where("name", "=", name,)
      .execute();

    for (let attempt = 0; attempt < 3; attempt++) {
      await expect(
        createDefinition(state, def({ name, category: ItemCategory.Treasure, },),),
      ).rejects.toThrow(DuplicateItemDefinitionError,);
    }

    const after = await db.selectFrom("items",).select("id",).where("world_id", "=", worldA,).where("name", "=", name,)
      .execute();

    expect(after,).toHaveLength(before.length,);
    expect(after,).toHaveLength(1,);
  });

  test("allows the same name in a different world", async () => {
    const name = `Shared Name ${uid()}`;
    await createDefinition(state, def({ name, worldId: worldA, },),);

    // A different world is a different dedupe boundary — this must succeed.
    const other = await createDefinition(state, def({ name, worldId: worldB, },),);

    expect(other,).not.toBe(name,);
  });

  test("allows the same name under a different category", async () => {
    const name = `Category Clash ${uid()}`;
    await createDefinition(state, def({ name, category: ItemCategory.Weapon, },),);

    // Same world, same name, different category — must still insert.
    const other = await createDefinition(state, def({ name, category: ItemCategory.Armor, },),);

    const rows = await db.selectFrom("items",).select("id",).where("world_id", "=", worldA,).where("name", "=", name,)
      .execute();
    expect(rows,).toHaveLength(2,);
    expect(other,).toBeTruthy();
  });

  test("still rejects a definition whose effects are malformed", async () => {
    const name = `Broken Effects ${uid()}`;

    // Effect validation runs before the dedupe lookup, so a malformed payload
    // must surface its own error rather than a duplicate error.
    await expect(
      createDefinition(state, def({ name, properties: { effects: "not-an-array", }, },),),
    ).rejects.toThrow("properties.effects must be an array",);
  });
});

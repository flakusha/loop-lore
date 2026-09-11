// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for recipe material replacement and its row helpers.
 *
 * `replaceMaterials` runs in one transaction: old rows are deleted and the
 * new set inserted together. Read-backs prove the exact final set — a
 * delete-without-insert bug would leave the table empty, not stale.
 */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { uid, } from "../../../utils";
import type { DB, } from "../../../db/schema";
import { createTestDb, } from "../../../test-utils/create-test-db";
import {
  insertItems,
  insertUsers,
  insertWorlds,
} from "../../../test-utils/insert-helpers";
import { recipeMaterialInsertRows, rowToRecipeWithMaterials, } from "./helpers";
import type { RecipeMaterialDbRow, RecipeRow, } from "./helpers";
import { replaceMaterials, } from "./materials";

async function seedRecipe(db: Kysely<DB>, worldId: string, outputItemId: string,): Promise<string> {
  const recipeId = uid();
  const now = new Date().toISOString();
  await db.insertInto("crafting_recipes",).values({
    id: recipeId,
    world_id: worldId,
    name: "Recipe",
    description: null,
    discipline: "smithing",
    tier: 1,
    level_required: 1,
    output_item_id: outputItemId,
    output_quantity: 1,
    crafting_time_seconds: 1,
    base_success_chance: 1,
    base_quality_min: 1,
    base_quality_max: 10,
    perfect_threshold: 100,
    station_type_required: null,
    discovered_by_default: 1,
    tags: "[]",
    created_at: now,
    updated_at: now,
  },).execute();
  return recipeId;
}

async function seedWorld(): Promise<{
  db: Kysely<DB>;
  worldId: string;
  itemA: string;
  itemB: string;
  out: string;
}> {
  const { db, } = await createTestDb();
  const userId = uid();
  await insertUsers(db, `user-${userId}`, "Crafter", {
    id: userId,
    role: "solo",
    status: "active",
    settings: "{}",
  } as never,);
  const worldId = uid();
  await insertWorlds(db, userId, "Craft World", { id: worldId, } as never,);
  const itemA = uid();
  const itemB = uid();
  const out = uid();
  await insertItems(db, worldId, "ItemA", "material", { id: itemA, } as never,);
  await insertItems(db, worldId, "ItemB", "material", { id: itemB, } as never,);
  await insertItems(db, worldId, "Out", "material", { id: out, } as never,);
  return { db, worldId, itemA, itemB, out, };
}

async function materialRows(
  db: Kysely<DB>,
  recipeId: string,
): Promise<{ item_id: string; quantity: number; slot_type: string }[]> {
  return db
    .selectFrom("crafting_recipe_materials",)
    .select(["item_id", "quantity", "slot_type",],)
    .where("recipe_id", "=", recipeId,)
    .orderBy("sort_order",)
    .execute() as Promise<{ item_id: string; quantity: number; slot_type: string }[]>;
}

describe("replaceMaterials", () => {
  test("replaces the old set with the new set exactly", async () => {
    const { db, worldId, itemA, itemB, out, } = await seedWorld();
    try {
      const recipeId = await seedRecipe(db, worldId, out,);
      await replaceMaterials(db, recipeId, [{ itemId: itemA, quantity: 2, },],);
      expect(await materialRows(db, recipeId,),).toEqual([
        { item_id: itemA, quantity: 2, slot_type: "required", },
      ],);
      await replaceMaterials(db, recipeId, [
        { itemId: itemB, quantity: 5, slotType: "optional", sortOrder: 2, },
        { itemId: itemA, quantity: 1, sortOrder: 1, },
      ],);
      // Old row gone; new rows present with fields mapped.
      expect(await materialRows(db, recipeId,),).toEqual([
        { item_id: itemA, quantity: 1, slot_type: "required", },
        { item_id: itemB, quantity: 5, slot_type: "optional", },
      ],);
    } finally {
      await db.destroy();
    }
  });

  test("empty set clears all materials", async () => {
    const { db, worldId, itemA, out, } = await seedWorld();
    try {
      const recipeId = await seedRecipe(db, worldId, out,);
      await replaceMaterials(db, recipeId, [{ itemId: itemA, quantity: 2, },],);
      await replaceMaterials(db, recipeId, [],);
      expect(await materialRows(db, recipeId,),).toEqual([],);
    } finally {
      await db.destroy();
    }
  });

  test("leaves other recipes untouched", async () => {
    const { db, worldId, itemA, itemB, out, } = await seedWorld();
    try {
      const first = await seedRecipe(db, worldId, out,);
      const second = await seedRecipe(db, worldId, out,);
      await replaceMaterials(db, first, [{ itemId: itemA, quantity: 2, },],);
      await replaceMaterials(db, second, [{ itemId: itemB, quantity: 3, },],);
      expect(await materialRows(db, first,),).toEqual([
        { item_id: itemA, quantity: 2, slot_type: "required", },
      ],);
    } finally {
      await db.destroy();
    }
  });
});

describe("recipeMaterialInsertRows", () => {
  test("maps opts with defaults", () => {
    const rows = recipeMaterialInsertRows("r1", [{ itemId: "i1", quantity: 2, },], "2026-01-01T00:00:00.000Z",);
    expect(rows.length,).toBe(1,);
    expect(rows[0],).toMatchObject({
      recipe_id: "r1",
      item_id: "i1",
      quantity: 2,
      slot_type: "required",
      quality_requirement: null,
      bonus_effect: null,
      sort_order: 0,
    },);
  });
});

describe("rowToRecipeWithMaterials", () => {
  test("converts snake_case rows to camelCase with parsed tags", () => {
    const recipe = {
      id: "r1",
      world_id: "w1",
      name: "R",
      description: null,
      discipline: "smithing",
      tier: 1,
      level_required: 1,
      output_item_id: "o1",
      output_quantity: 1,
      crafting_time_seconds: 1,
      base_success_chance: 1,
      base_quality_min: 1,
      base_quality_max: 10,
      perfect_threshold: 100,
      station_type_required: null,
      discovered_by_default: 1,
      tags: '["fire"]',
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    } as unknown as RecipeRow;
    const materials = [{
      id: "m1",
      recipe_id: "r1",
      item_id: "i1",
      quantity: 2,
      slot_type: "required",
      quality_requirement: null,
      bonus_effect: null,
      sort_order: 1,
    },] as RecipeMaterialDbRow[];
    const out = rowToRecipeWithMaterials(recipe, materials,);
    expect(out.worldId,).toBe("w1",);
    expect(out.discoveredByDefault,).toBe(true,);
    expect(out.tags,).toEqual(["fire",],);
    expect(out.materials[0],).toMatchObject({ id: "m1", itemId: "i1", quantity: 2, },);
  });
});

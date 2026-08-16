// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { CraftingDiscipline, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { jsonStringifyOr, uid, } from "../../../utils";
import { recipeMaterialInsertRows, rowToRecipeWithMaterials, } from "./helpers";
import type {
  CreateRecipeOpts,
  RecipeWithMaterials,
} from "./types";

/** Create a recipe with materials in a single transaction. */
export async function createRecipe(db: Kysely<DB>, opts: CreateRecipeOpts,): Promise<string> {
  const id = uid();
  const now = new Date().toISOString();

  await db.transaction().execute(async (trx,) => {
    await trx
      .insertInto("crafting_recipes",)
      .values({
        id,
        world_id: opts.worldId,
        name: opts.name,
        description: opts.description ?? null,
        discipline: opts.discipline,
        tier: opts.tier,
        level_required: opts.levelRequired,
        output_item_id: opts.outputItemId,
        output_quantity: opts.outputQuantity ?? 1,
        crafting_time_seconds: opts.craftingTimeSeconds ?? 0,
        base_success_chance: opts.baseSuccessChance ?? 1,
        base_quality_min: opts.baseQualityMin ?? 0,
        base_quality_max: opts.baseQualityMax ?? 100,
        perfect_threshold: opts.perfectThreshold ?? 95,
        station_type_required: opts.stationTypeRequired ?? null,
        discovered_by_default: opts.discoveredByDefault ? 1 : 0,
        tags: jsonStringifyOr(opts.tags ?? [],),
        created_at: now,
        updated_at: now,
      },)
      .execute();

    if (opts.materials.length > 0) {
      await trx
        .insertInto("crafting_recipe_materials",)
        .values(recipeMaterialInsertRows(id, opts.materials, now,),)
        .execute();
    }
  },);

  return id;
}

/** Get a recipe with all its materials. */
export async function getRecipe(db: Kysely<DB>, recipeId: string,): Promise<RecipeWithMaterials | null> {
  const recipe = await db
    .selectFrom("crafting_recipes",)
    .where("id", "=", recipeId,)
    .selectAll()
    .executeTakeFirst();

  if (!recipe) { return null; }

  const materials = await db
    .selectFrom("crafting_recipe_materials",)
    .where("recipe_id", "=", recipeId,)
    .orderBy("sort_order", "asc",)
    .selectAll()
    .execute();

  return rowToRecipeWithMaterials(recipe, materials,);
}

/** List all recipes for a world, optionally filtered by discipline. */
export async function listRecipes(
  db: Kysely<DB>,
  worldId: string,
  opts?: { discipline?: CraftingDiscipline; tier?: number },
): Promise<RecipeWithMaterials[]> {
  let query = db
    .selectFrom("crafting_recipes",)
    .where("world_id", "=", worldId,)
    .orderBy("tier", "asc",)
    .orderBy("name", "asc",);

  if (opts?.discipline) {
    query = query.where("discipline", "=", opts.discipline,);
  }
  if (opts?.tier) {
    query = query.where("tier", "=", opts.tier,);
  }

  const recipes = await query.selectAll().execute();

  const result: RecipeWithMaterials[] = [];
  for (const recipe of recipes) {
    const materials = await db
      .selectFrom("crafting_recipe_materials",)
      .where("recipe_id", "=", recipe.id,)
      .orderBy("sort_order", "asc",)
      .selectAll()
      .execute();

    result.push(rowToRecipeWithMaterials(recipe, materials,),);
  }

  return result;
}

/** Delete a recipe and its materials (cascade handles materials). */
export async function deleteRecipe(db: Kysely<DB>, recipeId: string,): Promise<boolean> {
  const result = await db
    .deleteFrom("crafting_recipes",)
    .where("id", "=", recipeId,)
    .executeTakeFirst();

  return (result.numDeletedRows ?? 0n) > 0n;
}

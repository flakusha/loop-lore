// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { recipeMaterialInsertRows, } from "./helpers";
import type { CreateRecipeMaterialOpts, } from "./types";

/**
 * Replace all materials for a recipe.
 * @param db
 * @param recipeId
 * @param materials
 */
export async function replaceMaterials(
  db: Kysely<DB>,
  recipeId: string,
  materials: CreateRecipeMaterialOpts[],
): Promise<void> {
  const now = new Date().toISOString();

  await db.transaction().execute(async (trx,) => {
    await trx
      .deleteFrom("crafting_recipe_materials",)
      .where("recipe_id", "=", recipeId,)
      .execute();

    if (materials.length > 0) {
      await trx
        .insertInto("crafting_recipe_materials",)
        .values(recipeMaterialInsertRows(recipeId, materials, now,),)
        .execute();
    }
  },);
}

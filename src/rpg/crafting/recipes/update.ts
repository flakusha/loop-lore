// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { jsonStringifyOr, } from "../../../utils";
import type { UpdateRecipeOpts, } from "./types";

/** Update a recipe's base properties. */
export async function updateRecipe(db: Kysely<DB>, recipeId: string, opts: UpdateRecipeOpts,): Promise<boolean> {
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updated_at: now, };

  if (opts.name !== undefined) { updates.name = opts.name; }
  if (opts.description !== undefined) { updates.description = opts.description; }
  if (opts.discipline !== undefined) { updates.discipline = opts.discipline; }
  if (opts.tier !== undefined) { updates.tier = opts.tier; }
  if (opts.levelRequired !== undefined) { updates.level_required = opts.levelRequired; }
  if (opts.outputItemId !== undefined) { updates.output_item_id = opts.outputItemId; }
  if (opts.outputQuantity !== undefined) { updates.output_quantity = opts.outputQuantity; }
  if (opts.craftingTimeSeconds !== undefined) { updates.crafting_time_seconds = opts.craftingTimeSeconds; }
  if (opts.baseSuccessChance !== undefined) { updates.base_success_chance = opts.baseSuccessChance; }
  if (opts.baseQualityMin !== undefined) { updates.base_quality_min = opts.baseQualityMin; }
  if (opts.baseQualityMax !== undefined) { updates.base_quality_max = opts.baseQualityMax; }
  if (opts.perfectThreshold !== undefined) { updates.perfect_threshold = opts.perfectThreshold; }
  if (opts.stationTypeRequired !== undefined) { updates.station_type_required = opts.stationTypeRequired; }
  if (opts.discoveredByDefault !== undefined) { updates.discovered_by_default = opts.discoveredByDefault ? 1 : 0; }
  if (opts.tags !== undefined) { updates.tags = jsonStringifyOr(opts.tags,); }

  const result = await db
    .updateTable("crafting_recipes",)
    .set(updates,)
    .where("id", "=", recipeId,)
    .executeTakeFirst();

  return (result.numUpdatedRows ?? 0n) > 0n;
}

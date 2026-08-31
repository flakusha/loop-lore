// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { CraftingDiscipline, CraftingStationType, QualityLevel, } from "../../../db/enums";
import { jsonParseOr, uid, } from "../../../utils";
import type {
  CreateRecipeMaterialOpts,
  RecipeWithMaterials,
} from "./types";

/** crafting_recipes SELECT-all row shape */
export interface RecipeRow {
  id: string;
  world_id: string;
  name: string;
  description: string | null;
  discipline: CraftingDiscipline;
  tier: number;
  level_required: number;
  output_item_id: string;
  output_quantity: number;
  crafting_time_seconds: number;
  base_success_chance: number;
  base_quality_min: number;
  base_quality_max: number;
  perfect_threshold: number;
  station_type_required: CraftingStationType | null;
  discovered_by_default: number;
  tags: string;
  created_at: string;
  updated_at: string;
}

/** crafting_recipe_materials SELECT-all row shape */
export interface RecipeMaterialDbRow {
  id: string;
  recipe_id: string;
  item_id: string;
  quantity: number;
  slot_type: string;
  quality_requirement: QualityLevel | null;
  bonus_effect: string | null;
  sort_order: number;
}

/**
 * Convert a recipe row + material rows to a RecipeWithMaterials.
 * @param recipe
 * @param materials
 */
export function rowToRecipeWithMaterials(
  recipe: RecipeRow,
  materials: RecipeMaterialDbRow[],
): RecipeWithMaterials {
  return {
    id: recipe.id,
    worldId: recipe.world_id,
    name: recipe.name,
    description: recipe.description,
    discipline: recipe.discipline,
    tier: recipe.tier,
    levelRequired: recipe.level_required,
    outputItemId: recipe.output_item_id,
    outputQuantity: recipe.output_quantity,
    craftingTimeSeconds: recipe.crafting_time_seconds,
    baseSuccessChance: recipe.base_success_chance,
    baseQualityMin: recipe.base_quality_min,
    baseQualityMax: recipe.base_quality_max,
    perfectThreshold: recipe.perfect_threshold,
    stationTypeRequired: recipe.station_type_required,
    discoveredByDefault: recipe.discovered_by_default === 1,
    tags: jsonParseOr(recipe.tags, [],),
    materials: Array.from(materials, (m,) => ({
      id: m.id,
      recipeId: m.recipe_id,
      itemId: m.item_id,
      quantity: m.quantity,
      slotType: m.slot_type,
      qualityRequirement: m.quality_requirement,
      bonusEffect: m.bonus_effect,
      sortOrder: m.sort_order,
    }),),
    createdAt: recipe.created_at,
    updatedAt: recipe.updated_at,
  };
}

/**
 * Build crafting_recipe_materials insert rows for a recipe.
 * @param recipeId
 * @param materials
 * @param now
 */
export function recipeMaterialInsertRows(
  recipeId: string,
  materials: CreateRecipeMaterialOpts[],
  now: string,
) {
  return Array.from(materials, (mat,) => ({
    id: uid(),
    recipe_id: recipeId,
    item_id: mat.itemId,
    quantity: mat.quantity,
    slot_type: mat.slotType ?? "required",
    quality_requirement: mat.qualityRequirement ?? null,
    bonus_effect: mat.bonusEffect ?? null,
    sort_order: mat.sortOrder ?? 0,
    created_at: now,
  }),);
}

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { CraftingDiscipline, CraftingStationType, QualityLevel, } from "../../../db/enums";

/** */
export interface CreateRecipeOpts {
  worldId: string;
  name: string;
  description?: string;
  discipline: CraftingDiscipline;
  tier: number;
  levelRequired: number;
  outputItemId: string;
  outputQuantity?: number;
  craftingTimeSeconds?: number;
  baseSuccessChance?: number;
  baseQualityMin?: number;
  baseQualityMax?: number;
  perfectThreshold?: number;
  stationTypeRequired?: CraftingStationType;
  discoveredByDefault?: boolean;
  tags?: string[];
  materials: CreateRecipeMaterialOpts[];
}

/** */
export interface CreateRecipeMaterialOpts {
  itemId: string;
  quantity: number;
  slotType?: "required" | "optional" | "catalyst";
  qualityRequirement?: QualityLevel;
  bonusEffect?: string;
  sortOrder?: number;
}

/** */
export interface UpdateRecipeOpts {
  name?: string;
  description?: string;
  discipline?: CraftingDiscipline;
  tier?: number;
  levelRequired?: number;
  outputItemId?: string;
  outputQuantity?: number;
  craftingTimeSeconds?: number;
  baseSuccessChance?: number;
  baseQualityMin?: number;
  baseQualityMax?: number;
  perfectThreshold?: number;
  stationTypeRequired?: CraftingStationType | null;
  discoveredByDefault?: boolean;
  tags?: string[];
}

/** */
export interface RecipeWithMaterials {
  id: string;
  worldId: string;
  name: string;
  description: string | null;
  discipline: CraftingDiscipline;
  tier: number;
  levelRequired: number;
  outputItemId: string;
  outputQuantity: number;
  craftingTimeSeconds: number;
  baseSuccessChance: number;
  baseQualityMin: number;
  baseQualityMax: number;
  perfectThreshold: number;
  stationTypeRequired: CraftingStationType | null;
  discoveredByDefault: boolean;
  tags: string[];
  materials: RecipeMaterialRow[];
  createdAt: string;
  updatedAt: string;
}

/** */
export interface RecipeMaterialRow {
  id: string;
  recipeId: string;
  itemId: string;
  quantity: number;
  slotType: string;
  qualityRequirement: QualityLevel | null;
  bonusEffect: string | null;
  sortOrder: number;
}

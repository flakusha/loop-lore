// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type {
  CraftingAttemptStatus,
  CraftingDiscipline,
  DiscoveryMethod,
  ItemCategory,
} from "../../db/enums";

/** Input for a craft attempt. */
export interface CraftAttemptOpts {
  actorId: string;
  worldId: string;
  recipeId: string;
  stationInstanceId?: string;
  /**
   * Experimentation attempt (EPIC-036 "Recipe Discovery"): may target an
   * undiscovered recipe; a successful roll then records the discovery
   * (method `experimentation`). Without this flag an undiscovered,
   * non-default recipe is rejected.
   */
  experiment?: boolean;
}

/** Material consumed or saved during crafting. */
export interface MaterialRecord {
  itemId: string;
  quantity: number;
}

/** Outcome of a craft attempt. */
export interface CraftResult {
  attemptId: string;
  status: CraftingAttemptStatus;
  quality: number;
  outputItemId: string | null;
  outputQuantity: number;
  materialsConsumed: MaterialRecord[];
  materialsSaved: MaterialRecord[];
  /** True when this attempt discovered the recipe (experimentation success). */
  recipeDiscovered: boolean;
}

/** Recorded craft attempt. */
export interface CraftAttempt {
  id: string;
  actorId: string;
  worldId: string;
  recipeId: string;
  stationInstanceId: string | null;
  materialsUsed: MaterialRecord[];
  status: CraftingAttemptStatus;
  qualityAchieved: number;
  outputItemId: string | null;
  outputQuantity: number;
  experienceGained: number;
  skillIncrease: number;
  bonusEffects: string;
  createdAt: string;
}

/** */
export interface ItemDef {
  name: string;
  description: string | null;
  category: ItemCategory;
  value: number;
  weight: number;
}

/** */
export interface StationBonuses {
  successBonus: number;
  qualityBonus: number;
  materialSavingChance: number;
}

// ── Recipe discovery ─────────────────────────────────────

/** Input for recording a recipe discovery. */
export interface RecordDiscoveryOpts {
  actorId: string;
  worldId: string;
  recipeId: string;
  method: DiscoveryMethod;
  /** Override the discovery timestamp (ISO 8601); defaults to now. */
  discoveredAt?: string;
  /** Starting mastery level; defaults to 0. */
  masteryLevel?: number;
}

/** A recorded recipe discovery. */
export interface RecipeDiscovery {
  id: string;
  actorId: string;
  worldId: string;
  recipeId: string;
  discoveryMethod: DiscoveryMethod;
  discoveredAt: string;
  masteryLevel: number;
  createdAt: string | null;
  updatedAt: string | null;
}

/** A discovery joined with the recipe's summary fields. */
export interface DiscoveredRecipe extends RecipeDiscovery {
  recipeName: string;
  discipline: CraftingDiscipline;
  tier: number;
}

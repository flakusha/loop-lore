// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { CraftingAttemptStatus, ItemCategory, } from "../../db/enums";

/** Input for a craft attempt. */
export interface CraftAttemptOpts {
  actorId: string;
  worldId: string;
  recipeId: string;
  stationInstanceId?: string;
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

export interface ItemDef {
  name: string;
  description: string | null;
  category: ItemCategory;
  value: number;
  weight: number;
}

export interface StationBonuses {
  successBonus: number;
  qualityBonus: number;
  materialSavingChance: number;
}

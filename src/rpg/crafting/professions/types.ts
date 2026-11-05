// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Profession domain types (row mappers' targets + service inputs).
 *
 * DB row shapes live in the generated schema (`src/db/schema-crafting.ts`,
 * tables `professions` / `profession_specializations`, DDL in migration
 * `001_init.ts` parts/009-crafting — the ticket's `011_crafting_professions`
 * citation is stale; 011 is actor BDI. `world_id` was made nullable by
 * migration `095_professions_world_optional.ts`). This module never imports
 * DB modules — everything is threaded with an explicit `Kysely<DB>` handle.
 */

import type { CraftingDiscipline, ProfessionBonusType, ProfessionTitle, } from "../../../db/enums-crafting.js";

/** A character's progression in one crafting/gathering discipline. */
export interface Profession {
  id: string;
  actorId: string;
  /** Owning world, or null for world-less (config-seeded) professions. */
  worldId: string | null;
  discipline: CraftingDiscipline;
  level: number;
  experience: number;
  title: ProfessionTitle;
  createdAt: string;
  updatedAt: string;
}

/** An unlocked specialization for a profession. */
export interface ProfessionSpecialization {
  id: string;
  professionId: string;
  name: string;
  description: string | null;
  bonusType: ProfessionBonusType;
  bonusValue: number;
  requirementLevel: number;
  isActive: boolean;
  createdAt: string;
}

/** The four bonus families a profession level grants (fractions 0..1). */
export interface ProfessionBonuses {
  success: number;
  quality: number;
  speed: number;
  materialSaving: number;
}

/** Progression snapshot for a level (see `./progression.ts`). */
export interface ProfessionProgression {
  level: number;
  title: ProfessionTitle;
  bonuses: ProfessionBonuses;
  /** Level at which the next title band starts; null at the cap. */
  nextTitleAt: number | null;
}

/** Input for assigning a discipline to an actor. */
export interface CreateProfessionInput {
  actorId: string;
  /** Owning world; omit for world-less (config-seeded) professions. */
  worldId?: string;
  discipline: CraftingDiscipline;
  /** Starting level (default 1; clamped to 1..100). */
  level?: number;
}

/** Input for unlocking a specialization on a profession. */
export interface AddSpecializationInput {
  name: string;
  description?: string;
  bonusType: ProfessionBonusType;
  /** Bonus magnitude (percent for percent-flavored types). */
  bonusValue: number;
  /** Minimum profession level required to hold the specialization. */
  requirementLevel?: number;
}

/** Result of an XP gain — mirrors the skills service's `XpGainResult`. */
export interface ProfessionXpResult {
  professionId: string;
  xpGained: number;
  totalExperience: number;
  newLevel: number;
  newTitle: ProfessionTitle;
  leveledUp: boolean;
  titleChanged: boolean;
}

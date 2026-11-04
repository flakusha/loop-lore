// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ActorVisibility, ContentRating, UserRole, } from "@/db/enums";

/** */
export interface CharacterTemplate {
  /** Hard ID for deterministic test reseeding (optional — generated if omitted) */
  id?: string;
  /** Display name (required) */
  name: string;
  /** Character description (required) */
  description: string;
  /** Personality traits */
  personality?: string;
  /** General look / body / face — immutable visual base. Required. */
  appearance?: string;
  /** RP scenario/setting */
  scenario?: string;
  /** Welcome message */
  welcome_message?: string;
  /** System prompt override */
  system_prompt?: string;
  /** Example dialogue */
  mes_example?: string;
  /** Tags for classification */
  tags?: string[];
  /** Creator attribution */
  creator?: string;

  // ── Identity ────────────────────────────────────────────
  /** Identity — persisted as character_permanent_traits at seed time */
  species?: string;
  subrace?: string;
  gender?: string;
  age?: string | number;
  homeland?: string;
  culture?: string;

  // ── Avatar ──────────────────────────────────────────────
  /** Optional avatar for the seeded character (resolved at seed time) */
  avatar?: { type: "file"; path: string } | { type: "default" };

  // ── Access Control ──────────────────────────────────────
  /** Visibility level. Default "public" */
  visibility?: ActorVisibility;
  /** Content rating. Default "sfw" */
  content_rating?: ContentRating;
  /** User roles that can see/use this character. Default ["user", "admin"] */
  target_roles?: UserRole[];

  // ── Admin Settings ──────────────────────────────────────
  /** Character can be used as template for user-created chars */
  is_template?: boolean;
  /** Auto-add to new users' character list */
  is_default?: boolean;

  // ── Wardrobe / Outfits (epic-wardrobe-avatar-variants.md) ──
  // Optional. Existing emotion-only characters keep working without these
  // fields (null outfit = today's behavior; zero-migration surprise).
  /** Default outfit id used when no context binding fires. */
  default_outfit?: string;
  /** Wardrobe catalog: distinct (outfit_id) entries this character can wear. */
  outfits?: CharacterOutfitTemplate[];
  /** Equipped-items → outfit mapping (deferred loadout-bridge phase). */
  loadouts?: CharacterLoadoutTemplate[];

  // ── RPG sheets (TASK-character-config-skills-professions) ──
  /** Config-seeded baseline skills, created at seed time. */
  skills?: SkillTemplate[];
  /** Config-seeded starting professions (crafting disciplines), seeded at start. */
  professions?: ProfessionTemplate[];
}

/** Wardrobe outfit descriptor for a character template. */
export interface CharacterOutfitTemplate {
  /** Stable outfit id referenced by loadouts and selection ladder. */
  id: string;
  /** Human-readable label shown in UI. */
  name: string;
  /** Prompt-fragment fed to the avatar generator
   *  (identity-anchor + outfit-descriptor + emotion-descriptor). */
  descriptor: string;
  /** Free-form tags (formal|armor|sleepwear|swim|...) used by binding rules. */
  tags?: string[];
}

/** Loadout bridge entry: maps an equipped-item slot to an outfit. */
export interface CharacterLoadoutTemplate {
  /** Symbolic name for the loadout rule. */
  name: string;
  /** Inventory slot key (e.g. "chest", "legs", "head"). */
  slot: string;
  /** Substring match against equipped item id/name. */
  item_match: string;
  /** Outfit id (from outfits[]) to switch into. */
  outfit: string;
}

/**
 * Config-seeded baseline skill (TASK-character-config-skills-professions).
 * String-typed because this core package cannot import app-side enums; the
 * seeding path validates against `SkillCategory` / `ProficiencyLevel`.
 */
export interface SkillTemplate {
  /** Skill display name (e.g. "Lore Mastery"). */
  name: string;
  /** One of the SkillCategory values (combat, magic, crafting, social, exploration, survival, knowledge, stealth). */
  category: string;
  /** Starting level (default 1). */
  level?: number;
  /** One of the ProficiencyLevel values (novice…grandmaster); default novice. */
  proficiency?: string;
  description?: string;
}

/**
 * Config-seeded starting profession (sibling of
 * TASK-professions-service-routes). `discipline` is one of the
 * CraftingDiscipline values (alchemy, smithing, enchanting, cooking,
 * tailoring, woodworking, jewelry, engineering); validated at seed time.
 */
export interface ProfessionTemplate {
  discipline: string;
  /** Starting level (default 1; clamped 1..100 by the service). */
  level?: number;
  specializations?: ProfessionSpecializationTemplate[];
}

/** Specialization pre-unlocked with a seeded profession. */
export interface ProfessionSpecializationTemplate {
  name: string;
  description?: string;
  /** One of the ProfessionBonusType values (speed, quality, success, material_saving, experience_gain). */
  bonusType: string;
  bonusValue: number;
  /** Minimum profession level required (must be ≤ the starting level). */
  requirementLevel?: number;
}

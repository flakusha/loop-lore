// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/characters.ts — Characters (template seeding) config type

import type { UserRole, } from "../../db/enums-core/users";

/** */
export interface CharactersConfig {
  /** Enable character template seeding on app start. Default true. */
  enabled: boolean;
  /** Default character templates to seed. Never overrides existing DB records. */
  templates: {
    /** Hard ID for deterministic test reseeding (optional — generated if omitted) */
    id?: string;
    name: string;
    description: string;
    personality?: string;
    scenario?: string;
    welcome_message?: string;
    system_prompt?: string;
    mes_example?: string;
    tags?: string[];
    creator?: string;
    /** Identity — persisted as character_permanent_traits at seed time */
    species?: string;
    subrace?: string;
    gender?: string;
    age?: string | number;
    homeland?: string;
    culture?: string;
    /** Optional avatar for the seeded character (resolved at seed time) */
    avatar?: { type: "file"; path: string } | { type: "default" };
    /** Visibility level. Default "public" */
    visibility?: "private" | "public";
    /** Content rating. Default "sfw" */
    content_rating?: "sfw" | "nsfw_mild" | "nsfw_moderate" | "nsfw_intense" | "nsfw_extreme";
    /** User roles that can see/use this character. Default ["user", "admin"] */
    target_roles?: UserRole[];
    /** Character can be used as template for user-created chars */
    is_template?: boolean;
    /** Auto-add to new users' character list */
    is_default?: boolean;
    /** Default outfit id used when no context binding fires (epic-wardrobe-avatar-variants.md). */
    default_outfit?: string;
    /** Wardrobe catalog: distinct (outfit_id) entries this character can wear. */
    outfits?: {
      /** Stable outfit id referenced by loadouts and selection ladder. */
      id: string;
      /** Human-readable label shown in UI. */
      name: string;
      /** Prompt-fragment fed to the avatar generator. */
      descriptor: string;
      /** Free-form tags (formal|armor|sleepwear|swim|...) used by binding rules. */
      tags?: string[];
    }[];
    /** Equipped-items → outfit mapping (deferred loadout-bridge phase). */
    loadouts?: {
      /** Symbolic name for the loadout rule. */
      name: string;
      /** Inventory slot key (e.g. "chest", "legs", "head"). */
      slot: string;
      /** Substring match against equipped item id/name. */
      item_match: string;
      /** Outfit id (from outfits[]) to switch into. */
      outfit: string;
    }[];
  }[];
}

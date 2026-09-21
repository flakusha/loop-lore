// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/spec/character.ts — Character-related types

import type { CharacterAsset, } from "./character-asset";
import type {
  AbilityScore,
  AbilitySource,
  AppearanceDetails,
  Condition,
  EquipmentSlot,
  InventoryItemType,
  ItemRarity,
  Motivation,
  PersonalityTrait,
  RelationshipTargetType,
  Skill,
  SpeechPatterns,
  Tag,
  TagCategory,
  Vital,
} from "./character-richer-fields";
import type { CharacterRelationshipType, ContentRating, WorldModifierType, } from "./enums";
import type { GrowthMode, } from "./growth";
import type { LorebookData, } from "./lorebook";

// ── Feature Flags ───────────────────────────────────

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// src/characters/spec/character.ts — Character-related types
// size-allow: 400
// Consolidated spec catalogue (was 4 sibling files; inlined to single export surface).
// ── Feature Flags ───────────────────────────────────
/** */
export interface CharacterFeatureFlags {
  rpg_mechanics?: boolean;
  inventory?: boolean;
  relationships?: boolean;
  mood?: boolean;
  traits?: boolean;
  lorebook?: boolean;
  assets?: boolean;
  nsfw?: boolean;
  /** Reserved: identity fields feed lore injection + memory config when enabled. Default false. */
  identity_lore?: boolean;
}

// ── Inventory ────────────────────────────────────────
/**
 * Inventory item carried by the character. Rich shape: legacy `type: string`
 * is preserved alongside the structured `InventoryItemType` enum, and
 * rarity/weight/value/properties/stackable are optional RPG metadata.
 * Existing V1 items (only id/name/type/description/quantity/equipped/metadata)
 * validate against this shape unchanged.
 */
export interface InventoryItem {
  id: string;
  name: string;
  type: string | InventoryItemType;
  description: string;
  quantity: number;
  equipped: boolean;
  rarity?: ItemRarity;
  weight?: number;
  value?: number;
  properties?: Record<string, unknown>;
  stackable?: boolean;
  metadata?: Record<string, unknown>;
}

// ── Character Relationship ───────────────────────────
/**
 * Relationship to another entity. Unified shape: legacy fields
 * (`target_character_id`, `notes`) coexist with rich fields (`target_type`,
 * `target_id`, `target_name`, `history`). All are optional except `type`
 * and `strength`. Existing V1 relationships validate unchanged.
 */
export interface CharacterRelationship {
  /** Target category. Defaults to "character" when omitted (legacy V1). */
  target_type?: RelationshipTargetType;
  /** Legacy V1 field — used when target_type is "character" or omitted. */
  target_character_id?: string;
  /** Rich field — opaque target id (used for faction/place/object targets). */
  target_id?: string;
  /** Display name of the target (rich field). */
  target_name?: string;
  type: CharacterRelationshipType;
  strength: number;
  /** Legacy V1 field — free-form notes. */
  notes?: string;
  /** Rich field — structured history. */
  history?: string;
}

// ── World Modifier ───────────────────────────────────
/** */
export interface WorldModifier {
  world_id: string;
  type: WorldModifierType;
  description: string;
  active: boolean;
}

// ── Locale Config ────────────────────────────────────
/** */
export interface LocaleConfig {
  default_locale: string;
  supported_locales: string[];
  fallback_locale: string;
}

// ── Character Outfit ───────────────────────────────────
/** Wardrobe outfit descriptor — canonical shape shared with config templates. */
export interface CharacterOutfit {
  /** Stable outfit id referenced by loadouts and selection ladder. */
  id: string;
  /** Human-readable label shown in UI. */
  name: string;
  /** Prompt-fragment fed to the avatar generator. */
  descriptor: string;
  /** Free-form tags (formal|armor|sleepwear|swim|...) used by binding rules. */
  tags?: string[];
}

// ── Localized Fields ─────────────────────────────────
/** */
export interface LocalizedFields {
  name?: Record<string, string>;
  description?: Record<string, string>;
  personality?: Record<string, string>;
  appearance?: Record<string, string>;
  scenario?: Record<string, string>;
  welcome_message?: Record<string, string>;
  mes_example?: Record<string, string>;
  system_prompt?: Record<string, string>;
  post_history_instructions?: Record<string, string>;
  alternate_greetings?: Record<string, string[]>;
  creator_notes?: Record<string, string>;
}
// Richer Optional Fields, Lorebook, and CharacterAsset shapes are imported
// at the top of this file. Re-export them below for back-compat so
// `import { AbilityScore, LorebookData, CharacterAsset, ... } from "./character"` keeps working.
export type {
  AbilityScore,
  AbilitySource,
  AppearanceDetails,
  Condition,
  EquipmentSlot,
  InventoryItemType,
  ItemRarity,
  Motivation,
  PersonalityTrait,
  RelationshipTargetType,
  Skill,
  SpeechPatterns,
  Tag,
  TagCategory,
  Vital,
};
export type { CharacterAsset, } from "./character-asset";
export type { LorebookData, LorebookEntry, } from "./lorebook";
/** */
export interface CharacterExtensions {
  stats?: Record<string, number>;
  inventory?: InventoryItem[];
  relationships?: CharacterRelationship[];
  abilities?: Record<string, AbilityScore>;
  vitals?: Record<string, Vital>;
  skills?: Skill[];
  equipment?: Record<string, EquipmentSlot>;
  motivations?: Motivation[];
  personality_traits?: PersonalityTrait[];
  appearance_details?: AppearanceDetails;
  structured_tags?: Tag[];
  speech_patterns?: SpeechPatterns;
  conditions?: Condition[];
  /** Free-form `languages` (≤ 10 entries; plugin bundles may extend with structured aliases). */
  languages?: string[];
  /** Free-form `alignment` (e.g. "lawful good", "neutral evil"). */
  alignment?: string;
  world_modifiers?: WorldModifier[];
  plugin_bundle?: string;
  feature_flags?: CharacterFeatureFlags;
  translations?: LocalizedFields;
  [key: string]: unknown;
}

// ── Canonical Character ──────────────────────────────
/** */
export interface CanonicalCharacter {
  name: string;
  description: string;
  personality: string;
  /** General look / body / face — immutable visual base. Required. */
  appearance: string;
  /** Default outfit id used when no context binding fires. Required with outfits. */
  default_outfit: string;
  /** Wardrobe catalog: at least one outfit required. */
  outfits: CharacterOutfit[];
  scenario?: string;
  welcome_message?: string;
  mes_example?: string;
  system_prompt?: string;
  post_history_instructions?: string;
  alternate_greetings?: string[];
  tags?: string[];
  creator?: string;
  creator_notes?: string;
  character_version?: string;
  nickname?: string | null;
  content_rating?: ContentRating;
  nsfw_categories?: string[];
  nsfw_hard_limits?: string[];
  /** Per-character author toggle (`.plan/epics/epic-character-growth.md` D1). */
  growth_mode?: GrowthMode;
  /** Opt-in LLM-assist pass (D6). Default false. */
  llm_assist_enabled?: boolean;
  /* Identity — persisted as character_permanent_traits identity/background rows at seed time. */
  species?: string;
  homeland?: string;
  culture?: string;
  gender?: string;
  age?: string | number;
  lorebook?: LorebookData;
  assets?: CharacterAsset[];
  extensions?: CharacterExtensions;
}

// CharacterRecord lives in `./character-record.ts`; re-exported here.
export type { CharacterRecord, } from "./character-record";
// The import block above makes these names available inside this file; the
// re-exports keep `import { LorebookData, LorebookEntry, CharacterAsset } from "./character"` working.

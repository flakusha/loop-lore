// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/spec/character.ts — Character-related types

import type {
  CharacterRelationshipType,
  ContentRating,
  ImportFormat,
  MigrationStatus,
  ReviewState,
  StorageFormat,
  WorldModifierType,
} from "./enums";
import type { GrowthMode, } from "./growth";

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

// ── Richer Optional Fields (RPG / Emergent Behavior) ───
//
// Backward-compatible optional fields for richer RPG mechanics and emergent
// behavior modeling. All fields are optional; existing characters validate
// unchanged. Plugin bundles may gate which fields apply. This is NOT a spec
// version bump — purely additive. The `_rich` suffix disambiguates richer
// alternatives to the legacy shapes (`InventoryItemRich`, `CharacterRelationshipRich`).
// See docs/spec/character-spec.md for the full type catalogue and migration notes.

/** Provenance of an ability score's current value (base | level | equipment | condition). */
export type AbilitySource = "base" | "level" | "equipment" | "condition";

/** Single ability score: STR/DEX/CON/INT/WIS/CHA or any system-defined ability. */
export interface AbilityScore {
  name: string;
  value: number;
  modifier?: number;
  source?: AbilitySource;
}

/** A single trainable skill bound to an ability (or system-defined). */
export interface Skill {
  id: string;
  name: string;
  value: number;
  ability?: string;
  proficiencies: number;
  sources: { type: string; id: string }[];
}

/** An equipped item bound to a slot (weapon | armor | ring | amulet | ...). */
export interface EquipmentSlot {
  slot: string;
  item_id?: string;
  item_name?: string;
  properties?: Record<string, unknown>;
}

/** Health / energy / sanity pool (hp | mp | stamina | sanity | ...). */
export interface Vital {
  name: string;
  max: number;
  current: number;
  regenerate?: number;
  properties?: Record<string, unknown>;
}

/** Structured motivation / behavioral dimension. */
export interface Motivation {
  type: "goal" | "fear" | "trait" | "bond" | "flaw" | "habit" | "catchphrase";
  text: string;
  strength?: number;
  context?: string;
}

/** Target type for a relationship entry (character | faction | place | object). */
export type RelationshipTargetType = "character" | "faction" | "place" | "object";

/** Structured personality trait (machine-readable parallel to the freeform `personality` field). */
export interface PersonalityTrait {
  trait: string;
  value: number;
  context?: string;
}

/** Structured appearance dimensions (parallel to the freeform `appearance` field). */
export interface AppearanceDetails {
  height?: string;
  build?: string;
  hair?: string;
  eyes?: string;
  skin?: string;
  distinguishing?: string;
}

/** Tag category for filterable classification. */
export type TagCategory = "personality" | "species" | "role" | "theme" | "content" | "custom";

/** Structured tag (category + value), parallel to the freeform `tags` field. */
export interface Tag {
  category: TagCategory;
  value: string;
}

/** Inventory item type (richer than the legacy freeform `InventoryItem.type`). */
export type InventoryItemType =
  | "weapon"
  | "armor"
  | "consumable"
  | "tool"
  | "key"
  | "quest"
  | "material";

/** Item rarity ladder. */
export type ItemRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

/** Voice and speech style hints for the LLM. */
export interface SpeechPatterns {
  formal?: string;
  informal?: string;
  slang?: string;
  catchphrases?: string[];
  dialect?: string;
  quirks?: string[];
}

/** Runtime status effect. */
export interface Condition {
  id: string;
  name: string;
  description?: string;
  source?: string;
  duration?: { type: string; value: number };
  effects?: Record<string, unknown>;
}

// ── Character Extensions ─────────────────────────────
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

// ── Character with Metadata ──────────────────────────
/** */
export interface CharacterRecord extends CanonicalCharacter {
  id: string;
  owner_id: string;
  user_id: string | null;
  actor_type: string;
  display_name: string;
  visibility: string;
  content_rating: ContentRating;
  review_state: ReviewState;
  storage_format: StorageFormat;
  data_source_format: StorageFormat;
  data_json: string;
  data_yaml: string | null;
  data_toml: string | null;
  import_format: ImportFormat | null;
  import_source: string | null;
  migration_status: MigrationStatus;
  migration_from_version: string | null;
  migration_to_version: string;
  allowed_age: number | null;
  created_at: string;
  updated_at: string;
}

// ── Lorebook ──────────────────────────────────
/** */
export interface LorebookData {
  name?: string;
  description?: string;
  scan_depth?: number;
  token_budget?: number;
  recursive_scanning?: boolean;
  entries: LorebookEntry[];
}

/** */
export interface LorebookEntry {
  keys: string[];
  content: string;
  enabled: boolean;
  insertion_order: number;
  case_sensitive: boolean;
  name: string;
  priority: number;
  id: number;
  comment?: string;
  selective: boolean;
  constant: boolean;
  position: "before_char" | "after_char";
  use_regex?: boolean;
  /** Activation condition override (ticket FEAT-055). */
  key_type?: "keyword" | "regex";
  /** AND/OR activation groups: each inner array is AND, the outer array is OR. */
  key_groups?: string[][];
  /** How many recent user messages to scan for activation (default 1, max 10). */
  scan_depth?: number;
  /** Stochastic activation probability 0..1 for ambient lore. */
  activation_chance?: number;
  extensions?: Record<string, unknown>;
}

// ── Character Asset ───────────────────────────
/** */
export interface CharacterAsset {
  type: string;
  name: string;
  uri: string;
  ext: string;
  data?: Buffer; // For CHARX imports
}

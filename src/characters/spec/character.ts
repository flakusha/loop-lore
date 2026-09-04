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
}

// ── Inventory ────────────────────────────────────────
/** */
export interface InventoryItem {
  id: string;
  name: string;
  type: string;
  description: string;
  quantity: number;
  equipped: boolean;
  metadata?: Record<string, unknown>;
}

// ── Character Relationship ───────────────────────────
/** */
export interface CharacterRelationship {
  target_character_id: string;
  type: CharacterRelationshipType;
  strength: number;
  notes: string;
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

// ── Localized Fields ─────────────────────────────────
/** */
export interface LocalizedFields {
  name?: Record<string, string>;
  description?: Record<string, string>;
  personality?: Record<string, string>;
  scenario?: Record<string, string>;
  welcome_message?: Record<string, string>;
  mes_example?: Record<string, string>;
  system_prompt?: Record<string, string>;
  post_history_instructions?: Record<string, string>;
  alternate_greetings?: Record<string, string[]>;
  creator_notes?: Record<string, string>;
}

// ── Character Extensions ─────────────────────────────
/** */
export interface CharacterExtensions {
  stats?: Record<string, number>;
  inventory?: InventoryItem[];
  relationships?: CharacterRelationship[];
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

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/spec/character-richer-fields.ts — optional richer RPG / emergent
// behavior shapes. Backward-compatible: every field on `CharacterExtensions` is
// optional, existing characters validate unchanged, and plugin bundles gate
// which fields apply. The `_rich` suffix disambiguates richer alternatives to
// the legacy shapes (`InventoryItemRich`, `CharacterRelationshipRich`). See
// docs/spec/character-spec.md for the full type catalogue and migration notes.

// ── Richer Optional Fields (RPG / Emergent Behavior) ───

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

/**
 * DB Schema — Character Domain Tables
 *
 * Permanent traits, world traits, location traits,
 * mood, relationships, avatars, emotions, licensing, availability.
 */
import type { Generated, } from "kysely";
import type {
  AdminOverrideAction,
  AvailabilityStatus,
  AvatarSelectionRule,
  LicenseType,
  RelationshipType,
  TraitCategory,
  VisibilityOverride,
  WorldTraitCategory,
} from "./enums";

// ── Character Permanent Traits (Layer 0) ──────────────────
export interface CharacterPermanentTraits {
  id: Generated<string>;
  actor_id: string;
  trait_category: TraitCategory;
  trait_name: string;
  trait_value: string;
  immutable: Generated<number>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Character World Traits (Layer 2) ──────────────────────
export interface CharacterWorldTraits {
  id: Generated<string>;
  actor_id: string;
  world_id: string;
  trait_category: WorldTraitCategory;
  trait_name: string;
  trait_value: string;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Character Location Traits (Layer 3) ───────────────────
export interface CharacterLocationTraits {
  id: Generated<string>;
  actor_id: string;
  location_id: string;
  trait_name: string;
  trait_value: string;
  bonus: Generated<number>;
  penalty: Generated<number>;
  effects: Generated<string>; // JSON
  equipment_override: Generated<string>; // JSON: clothes, accessories, weapons, other_items
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Character Mood ────────────────────────────────────────
export interface CharacterMood {
  id: Generated<string>;
  actor_id: string;
  world_id: string | null;
  happiness: Generated<number>;
  base_mood: Generated<string>;
  current_mood: Generated<string>;
  mood_stability: Generated<number>;
  expression_modifiers: Generated<string>; // JSON
  last_mood_change: Generated<string>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Mood Events ───────────────────────────────────────────
export interface MoodEvents {
  id: Generated<string>;
  actor_id: string;
  world_id: string | null;
  event_type: string;
  happiness_delta: number;
  mood_override: string | null;
  source: string;
  source_id: string | null;
  created_at: Generated<string>;
}

// ── Character Relationships ───────────────────────────────
export interface CharacterRelationships {
  id: Generated<string>;
  actor_id: string;
  target_actor_id: string;
  world_id: string | null;
  relationship_type: RelationshipType;
  standing: Generated<number>;
  trust: Generated<number>;
  familiarity: Generated<number>;
  is_bidirectional: Generated<number>;
  metadata: Generated<string>; // JSON
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Character Avatars ─────────────────────────────────────
export interface CharacterAvatars {
  id: Generated<string>;
  actor_id: string;
  asset_id: string;
  label: string;
  tags: Generated<string>; // JSON
  is_primary: Generated<number>;
  sort_order: Generated<number>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Character Avatar Config ───────────────────────────────
export interface CharacterAvatarConfig {
  id: Generated<string>;
  actor_id: string;
  selection_rule: Generated<AvatarSelectionRule>;
  weights: Generated<string>; // JSON
  fallback_chain: Generated<string>; // JSON array
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── World Avatar Config ───────────────────────────────────
export interface WorldAvatarConfig {
  id: Generated<string>;
  world_id: string;
  actor_id: string;
  selection_rule_override: AvatarSelectionRule | null;
  weights_override: string | null; // JSON
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Emotions ──────────────────────────────────────────────
export interface Emotions {
  id: Generated<string>;
  name: string;
  display_name: string;
  category: string;
  valence: number;
  arousal: number;
  icon: string | null;
  created_at: Generated<string>;
}

// ── Character Emotions ────────────────────────────────────
export interface CharacterEmotions {
  id: Generated<string>;
  actor_id: string;
  emotion_id: string;
  intensity: Generated<number>;
  context: string | null; // JSON
  expires_at: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Character Availability ────────────────────────────────
export interface CharacterAvailability {
  id: Generated<string>;
  actor_id: string;
  status: Generated<AvailabilityStatus>;
  usage_policy: string | null; // JSON
  activity_restrictions: Generated<string>; // JSON array
  content_policy: string | null; // JSON
  nsfw_policy: string | null; // JSON
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Character Licensing ───────────────────────────────────
export interface CharacterLicensing {
  id: Generated<string>;
  actor_id: string;
  license_type: LicenseType;
  custom_license_text: string | null;
  attribution: string | null;
  allow_derivatives: Generated<number>;
  allow_commercial: Generated<number>;
  share_alike: Generated<number>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Admin Character Overrides ─────────────────────────────
export interface AdminCharacterOverrides {
  id: Generated<string>;
  actor_id: string;
  admin_id: string;
  action: AdminOverrideAction;
  visibility_override: VisibilityOverride | null;
  license_override: LicenseType | null;
  reason: string | null;
  expires_at: string | null;
  created_at: Generated<string>;
}

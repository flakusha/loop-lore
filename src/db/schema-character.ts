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
  BodyBuild,
  ContentIntensity,
  FantasyCategory,
  HeatPhase,
  LicenseType,
  NarrativeStyle,
  NsfwEncounterType,
  NsfwLocationType,
  RelationshipType,
  SeductionSkillCategory,
  SizeCategory,
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

// ── NSFW: Character Intimacy ─────────────────────────────
/** Tracks intimacy score between two actors. */
export interface CharacterIntimacy {
  id: Generated<string>;
  actor_id: string;
  target_actor_id: string;
  world_id: string | null;
  /** 0–100 intimacy score. */
  score: Generated<number>;
  /** JSON — last N actions that changed intimacy. */
  action_history: Generated<string>;
  /** JSON — threshold events that have fired. */
  unlocked_thresholds: Generated<string>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── NSFW: Character Arousal ──────────────────────────────
/** Per-actor arousal state (transient, decays over time). */
export interface CharacterArousal {
  id: Generated<string>;
  actor_id: string;
  world_id: string | null;
  /** 0–100 arousal level. */
  level: Generated<number>;
  /** Build-up rate multiplier (modified by mood, items, heat). */
  buildup_rate: Generated<number>;
  /** Decay rate per tick. */
  decay_rate: Generated<number>;
  /** JSON — active modifiers (partner, location, substances). */
  modifiers: Generated<string>;
  last_update: Generated<string>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── NSFW: Character Desire Profile ───────────────────────
/** What a character finds attractive — turn-ons, turn-offs, fetishes, hard limits. */
export interface CharacterDesireProfile {
  id: Generated<string>;
  actor_id: string;
  /** JSON array — tags the character finds attractive. */
  turn_ons: Generated<string>;
  /** JSON array — tags the character finds unattractive. */
  turn_offs: Generated<string>;
  /** JSON array — fetish tags. */
  fetishes: Generated<string>;
  /** JSON array — absolute limits (enforced mechanically). */
  hard_limits: Generated<string>;
  /** 0–100 — current desire intensity. */
  current_desire: Generated<number>;
  desire_decay_rate: Generated<number>;
  desire_buildup_rate: Generated<number>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── NSFW: Seduction Skills ───────────────────────────────
/** Tracks a character's seduction skill levels. */
export interface CharacterSeductionSkills {
  id: Generated<string>;
  actor_id: string;
  skill_category: SeductionSkillCategory;
  skill_name: string;
  /** 1–100 skill level. */
  level: Generated<number>;
  /** Experience points toward next level. */
  xp: Generated<number>;
  xp_to_next: Generated<number>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── NSFW: Encounter Phases ───────────────────────────────
/** Structured adult encounter with phases and outcomes. */
export interface NsfwEncounters {
  id: Generated<string>;
  world_id: string | null;
  encounter_type: NsfwEncounterType;
  intensity: ContentIntensity;
  narrative_style: NarrativeStyle;
  /** JSON array — participant actor IDs. */
  participants: string;
  /** JSON array — encounter phases. */
  phases: Generated<string>;
  current_phase: Generated<number>;
  /** JSON array — possible outcomes. */
  outcomes: Generated<string>;
  /** JSON array — content tags. */
  content_tags: Generated<string>;
  completed: Generated<number>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── NSFW: Body Profile ───────────────────────────────────
/** Physical attributes affecting NSFW interactions. */
export interface CharacterBodyProfile {
  id: Generated<string>;
  actor_id: string;
  /** 1–100 stamina — affects encounter duration. */
  stamina: Generated<number>;
  /** 1–100 flexibility — affects available actions. */
  flexibility: Generated<number>;
  /** 1–100 sensitivity — affects arousal buildup. */
  sensitivity: Generated<number>;
  /** 1–100 endurance — affects recovery time. */
  endurance: Generated<number>;
  size_category: Generated<SizeCategory>;
  build: Generated<BodyBuild>;
  /** 1–100 beauty. */
  beauty: Generated<number>;
  /** 1–100 charisma. */
  charisma: Generated<number>;
  /** 1–100 style/fashion. */
  style: Generated<number>;
  /** Natural scent — affects pheromone interactions. */
  scent: Generated<string | null>;
  /** JSON — active body modifications. */
  modifications: Generated<string>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── NSFW: Heat Cycle ─────────────────────────────────────
/** Species-specific reproductive cycles (optional per-actor). */
export interface CharacterHeatCycle {
  id: Generated<string>;
  actor_id: string;
  species: string;
  /** Days per full cycle. */
  cycle_length_days: Generated<number>;
  current_phase: Generated<HeatPhase>;
  days_until_next_heat: Generated<number>;
  /** JSON — mechanical effects during heat. */
  effects: Generated<string>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── NSFW: Fantasies ──────────────────────────────────────
/** Character fantasies/kinks — discovered through play or defined at creation. */
export interface CharacterFantasies {
  id: Generated<string>;
  actor_id: string;
  fantasy_name: string;
  category: FantasyCategory;
  intensity: Generated<ContentIntensity>;
  /** JSON — requirements (partner type, location, equipment). */
  requirements: Generated<string>;
  /** JSON — effects when fulfilled. */
  fulfillment_effects: Generated<string>;
  /** JSON — risk factors. */
  risks: Generated<string>;
  discovered_through: string | null;
  initial_reaction: Generated<string>;
  current_feeling: Generated<string>;
  times_explored: Generated<number>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── NSFW: Location NSFW Config ───────────────────────────
/** NSFW-relevant metadata for world locations. */
export interface LocationNsfwConfig {
  id: Generated<string>;
  location_id: string;
  location_type: NsfwLocationType;
  privacy_level: Generated<string>;
  /** 0–100 — chance of being caught. */
  discovery_chance: Generated<number>;
  /** JSON — atmosphere scores. */
  atmosphere: Generated<string>;
  /** JSON array — available equipment. */
  equipment: Generated<string>;
  /** JSON — risk factors. */
  risks: Generated<string>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

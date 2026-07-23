/**
 * DB Schema — Crafting Domain Tables
 *
 * Recipes, crafting stations, professions, gathering nodes,
 * recipe discoveries, and crafting attempt log.
 */
import type { Generated, } from "kysely";
import type {
  CraftingAttemptStatus,
  CraftingDiscipline,
  CraftingStationType,
  DiscoveryMethod,
  GatheringNodeType,
  MaterialSlotType,
  ProfessionBonusType,
  ProfessionTitle,
  QualityLevel,
} from "./enums";

// ── Crafting Recipes ──────────────────────────────────────

/** Recipe definitions — the blueprint for crafting items. */
export interface CraftingRecipes {
  id: Generated<string>;
  world_id: string;
  name: string;
  description: string | null;
  discipline: CraftingDiscipline;
  tier: number; // 1-10
  level_required: number;
  output_item_id: string; // FK → items.id
  output_quantity: number;
  crafting_time_seconds: number;
  base_success_chance: number; // 0.0-1.0
  base_quality_min: number; // 0-100
  base_quality_max: number; // 0-100
  perfect_threshold: number; // quality threshold for perfect craft
  station_type_required: CraftingStationType | null;
  discovered_by_default: number; // 0 or 1 (SQLite boolean)
  tags: string; // JSON array of tags
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Recipe Materials ──────────────────────────────────────

/** Materials required for a recipe. Each row is one material slot. */
export interface CraftingRecipeMaterials {
  id: Generated<string>;
  recipe_id: string; // FK → crafting_recipes.id
  item_id: string; // FK → items.id
  quantity: number;
  slot_type: MaterialSlotType;
  quality_requirement: QualityLevel | null;
  bonus_effect: string | null; // JSON: optional bonus when this material is high quality
  sort_order: number;
  created_at: Generated<string>;
}

// ── Crafting Stations (Definitions) ───────────────────────

/** Station type definitions — templates for stations that can exist in the world. */
export interface CraftingStationDefs {
  id: Generated<string>;
  world_id: string;
  name: string;
  description: string | null;
  station_type: CraftingStationType;
  tier: number; // 1-5
  speed_bonus: number; // 0.0-1.0 additional speed
  quality_bonus: number; // 0.0-1.0 additional quality
  success_bonus: number; // 0.0-1.0 additional success chance
  material_saving_chance: number; // 0.0-1.0 chance to save materials
  max_durability: number;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Crafting Station Instances ────────────────────────────

/** Placed stations in the world — references a station definition. */
export interface CraftingStationInstances {
  id: Generated<string>;
  station_def_id: string; // FK → crafting_station_defs.id
  world_id: string;
  location_id: string | null; // FK → locations.id
  owner_actor_id: string | null; // FK → actors.id (player-owned stations)
  current_durability: number;
  is_active: number; // boolean: 0 or 1
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Professions ───────────────────────────────────────────

/** Actor's profession level per discipline — tracks progression. */
export interface Professions {
  id: Generated<string>;
  actor_id: string; // FK → actors.id
  world_id: string; // FK → worlds.id
  discipline: CraftingDiscipline;
  level: number; // 1-100
  experience: number;
  title: ProfessionTitle;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Profession Specializations ────────────────────────────

/** Specialization branches within a profession. */
export interface ProfessionSpecializations {
  id: Generated<string>;
  profession_id: string; // FK → professions.id
  name: string;
  description: string | null;
  bonus_type: ProfessionBonusType;
  bonus_value: number; // 0.0-1.0
  requirement_level: number; // level required to unlock
  requirement_specializations: string; // JSON array of prerequisite spec IDs
  is_active: number; // boolean: 0 or 1
  created_at: Generated<string>;
}

// ── Recipe Discoveries ────────────────────────────────────

/** Which recipes an actor knows — tracks discovery progress. */
export interface RecipeDiscoveries {
  id: Generated<string>;
  actor_id: string; // FK → actors.id
  world_id: string; // FK → worlds.id
  recipe_id: string; // FK → crafting_recipes.id
  discovery_method: DiscoveryMethod;
  discovered_at: Generated<string>;
  mastery_level: number; // 0-100: affects quality/success bonuses
}

// ── Gathering Nodes (Definitions) ─────────────────────────

/** World-level gathering node definitions — templates for spawnable nodes. */
export interface GatheringNodeDefs {
  id: Generated<string>;
  world_id: string;
  name: string;
  description: string | null;
  node_type: GatheringNodeType;
  skill_required: number;
  respawn_time_seconds: number;
  rarity: QualityLevel;
  max_uses: number; // -1 for infinite
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Gathering Node Materials ──────────────────────────────

/** Possible drops from a gathering node definition. */
export interface GatheringNodeMaterials {
  id: Generated<string>;
  node_def_id: string; // FK → gathering_node_defs.id
  item_id: string; // FK → items.id
  min_quantity: number;
  max_quantity: number;
  drop_chance: number; // 0.0-1.0
  min_quality: QualityLevel | null;
  max_quality: QualityLevel | null;
  sort_order: number;
  created_at: Generated<string>;
}

// ── Gathering Node Instances ──────────────────────────────

/** Placed gathering nodes in the world. */
export interface GatheringNodeInstances {
  id: Generated<string>;
  node_def_id: string; // FK → gathering_node_defs.id
  world_id: string;
  location_id: string | null; // FK → locations.id
  current_uses: number;
  is_depleted: number; // boolean: 0 or 1
  respawn_at: string | null; // timestamp when node respawns
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

// ── Crafting Attempts Log ─────────────────────────────────

/** Audit log of all crafting attempts — for analytics and history. */
export interface CraftingAttempts {
  id: Generated<string>;
  actor_id: string; // FK → actors.id
  world_id: string; // FK → worlds.id
  recipe_id: string; // FK → crafting_recipes.id
  station_instance_id: string | null; // FK → crafting_station_instances.id
  materials_used: string; // JSON: [{item_id, quantity, quality}]
  status: CraftingAttemptStatus;
  quality_achieved: number; // 0-100
  output_item_id: string | null; // FK → items.id (null on failure)
  output_quantity: number;
  experience_gained: number;
  skill_increase: number;
  bonus_effects: string; // JSON array of bonus effects applied
  duration_ms: number;
  created_at: Generated<string>;
}

// ── Crafting Orders ───────────────────────────────────────

/** Player-created crafting requests — for economy integration. */
export interface CraftingOrders {
  id: Generated<string>;
  world_id: string;
  requester_actor_id: string; // FK → actors.id
  crafter_actor_id: string | null; // FK → actors.id (null = unassigned)
  recipe_id: string; // FK → crafting_recipes.id
  quantity: number;
  max_quality: QualityLevel | null;
  offered_payment: number; // currency amount
  offered_materials: string; // JSON: materials the requester provides
  status: string; // "open", "accepted", "completed", "cancelled"
  deadline: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

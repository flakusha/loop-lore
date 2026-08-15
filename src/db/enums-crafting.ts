/**
 * DB Schema Enums — Crafting Domain
 *
 * Crafting disciplines, stations, profession progression,
 * quality levels, discovery methods, and gathering nodes.
 */

// ── Crafting Disciplines ───────────────────────────────────

/** Core crafting disciplines — each produces specific item categories. */
export const CraftingDiscipline = {
  Alchemy: "alchemy",
  Smithing: "smithing",
  Enchanting: "enchanting",
  Cooking: "cooking",
  Tailoring: "tailoring",
  Woodworking: "woodworking",
  Jewelry: "jewelry",
  Engineering: "engineering",
} as const;
export type CraftingDiscipline = (typeof CraftingDiscipline)[keyof typeof CraftingDiscipline];

/** Gathering professions — raw material extraction. */
export const GatheringDiscipline = {
  Farming: "farming",
  Fishing: "fishing",
  Mining: "mining",
  Herbalism: "herbalism",
  Skinning: "skinning",
  Logging: "logging",
} as const;
export type GatheringDiscipline = (typeof GatheringDiscipline)[keyof typeof GatheringDiscipline];

// ── Crafting Stations ─────────────────────────────────────

export const CraftingStationType = {
  Anvil: "anvil",
  Forge: "forge",
  Workbench: "workbench",
  Cauldron: "cauldron",
  Loom: "loom",
  Furnace: "furnace",
  Kitchen: "kitchen",
  EnchantingTable: "enchanting_table",
} as const;
export type CraftingStationType = (typeof CraftingStationType)[keyof typeof CraftingStationType];

export const StationLocation = {
  PlayerHome: "player_home",
  World: "world",
  Guild: "guild",
  Portable: "portable",
} as const;
export type StationLocation = (typeof StationLocation)[keyof typeof StationLocation];

// ── Profession Titles ─────────────────────────────────────

export const ProfessionTitle = {
  Apprentice: "apprentice",
  Journeyman: "journeyman",
  Expert: "expert",
  Master: "master",
  Grandmaster: "grandmaster",
} as const;
export type ProfessionTitle = (typeof ProfessionTitle)[keyof typeof ProfessionTitle];

// ── Quality Levels ────────────────────────────────────────

export const QualityLevel = {
  Poor: "poor",
  Common: "common",
  Uncommon: "uncommon",
  Rare: "rare",
  Epic: "epic",
  Legendary: "legendary",
} as const;
export type QualityLevel = (typeof QualityLevel)[keyof typeof QualityLevel];

// ── Discovery Methods ─────────────────────────────────────

export const DiscoveryMethod = {
  Experimentation: "experimentation",
  RecipeBook: "recipe_book",
  NpcTeaching: "npc_teaching",
  QuestReward: "quest_reward",
  WorldDiscovery: "world_discovery",
  ReverseEngineering: "reverse_engineering",
  StartingKit: "starting_kit",
} as const;
export type DiscoveryMethod = (typeof DiscoveryMethod)[keyof typeof DiscoveryMethod];

// ── Gathering Nodes ───────────────────────────────────────

export const GatheringNodeType = {
  OreVein: "ore_vein",
  HerbPatch: "herb_patch",
  Tree: "tree",
  FishingSpot: "fishing_spot",
  Animal: "animal",
  BerryBush: "berry_bush",
  CrystalNode: "crystal_node",
} as const;
export type GatheringNodeType = (typeof GatheringNodeType)[keyof typeof GatheringNodeType];

// ── Crafting Attempt Status ───────────────────────────────

export const CraftingAttemptStatus = {
  Success: "success",
  Failure: "failure",
  CriticalSuccess: "critical_success",
  CriticalFailure: "critical_failure",
} as const;
export type CraftingAttemptStatus = (typeof CraftingAttemptStatus)[keyof typeof CraftingAttemptStatus];

// ── Recipe Material Slot ──────────────────────────────────

export const MaterialSlotType = {
  Required: "required",
  Optional: "optional",
  Catalyst: "catalyst",
} as const;
export type MaterialSlotType = (typeof MaterialSlotType)[keyof typeof MaterialSlotType];

// ── Profession Bonus Type ─────────────────────────────────

export const ProfessionBonusType = {
  Speed: "speed",
  Quality: "quality",
  Success: "success",
  MaterialSaving: "material_saving",
  ExperienceGain: "experience_gain",
} as const;
export type ProfessionBonusType = (typeof ProfessionBonusType)[keyof typeof ProfessionBonusType];

// ── Gathering Node Instances ──────────────────────────────

export const NodeInstanceState = {
  Available: "available",
  Depleted: "depleted",
} as const;
export type NodeInstanceState = (typeof NodeInstanceState)[keyof typeof NodeInstanceState];

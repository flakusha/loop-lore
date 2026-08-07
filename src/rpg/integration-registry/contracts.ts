/**
 * Integration Registry — shared interface contracts data
 *
 * The compile-time population list of `InterfaceContract` records seeding the
 * registry via `integration.addContract(...)`.
 */
import type { InterfaceContract, } from "./types";

/** Stable shared data contracts that every epic references. */
export const SHARED_CONTRACTS: InterfaceContract[] = [
  {
    id: "StatusEffect",
    kind: "shared_type",
    description: "Unified buff/debuff model used by Battle, Magic, Disease, Social, NSFW",
    sharedBy: ["battle", "magic", "disease", "social", "nsfw",],
  },
  {
    id: "DiceRoll",
    kind: "shared_type",
    description: "Unified dice resolution for all skill checks",
    sharedBy: [
      "rpg_mechanics",
      "battle",
      "social",
      "crime",
      "exploration",
      "magic",
    ],
  },
  {
    id: "CharacterStats",
    kind: "shared_type",
    description: "STR/DEX/CON/INT/WIS/CHA — mechanics stats owned by RPG, used everywhere",
    sharedBy: [
      "rpg_mechanics",
      "battle",
      "magic",
      "social",
      "crafting",
      "crime",
    ],
  },
  {
    id: "ReputationScore",
    kind: "shared_type",
    description: "Unified reputation model (faction standing + social reputation). MUST be one type, not two.",
    sharedBy: ["faction", "social", "crime",],
  },
  {
    id: "PlayerState",
    kind: "shared_type",
    description: "8-layer composite player state (see player-state-machine.md)",
    sharedBy: [
      "rpg_mechanics",
      "battle",
      "magic",
      "social",
      "crime",
      "disease",
      "weather",
      "nsfw",
      "exploration",
      "companion",
      "character_core",
      "resolution",
    ],
  },
  {
    id: "Item",
    kind: "shared_type",
    description: "Crafted items, loot, equipment — shared across crafting, inventory, economy, housing",
    sharedBy: ["items", "battle", "crafting", "economy", "housing",],
  },
  {
    id: "CraftingStation",
    kind: "shared_type",
    description: "Home crafting stations use same station model as world stations",
    sharedBy: ["crafting", "housing",],
  },
  {
    id: "Recipe",
    kind: "shared_type",
    description: "Recipe definitions shared between crafting, enchanting, and furniture crafting",
    sharedBy: ["crafting", "magic", "housing",],
  },
  {
    id: "StorageContainer",
    kind: "shared_type",
    description: "Housing storage extends inventory system",
    sharedBy: ["housing", "items",],
  },
  {
    id: "WorldLocation",
    kind: "shared_type",
    description: "Housing placement uses shared location model",
    sharedBy: ["housing", "exploration", "economy",],
  },
  {
    id: "Relationship",
    kind: "shared_type",
    description: "Character/AI relationship state — shared between character core, social, companion, NSFW",
    sharedBy: ["character_core", "social", "companion", "nsfw",],
  },
];

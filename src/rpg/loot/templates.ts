import { type LootEntry, } from "./types.js";

// ── Loot Table Templates ────────────────────────────────

/** Common consumables */
export const COMMON_CONSUMABLES: LootEntry[] = [
  {
    name: "Health Potion",
    description: "Restores 2d4+2 HP when consumed.",
    type: "consumable",
    rarity: "common",
    weight: 10,
    minQuantity: 1,
    maxQuantity: 3,
    minLevel: 1,
    goldValue: 25,
    metadata: { healing: "2d4+2", },
  },
  {
    name: "Antidote",
    description: "Cures poison and disease.",
    type: "consumable",
    rarity: "common",
    weight: 5,
    minQuantity: 1,
    maxQuantity: 1,
    minLevel: 1,
    goldValue: 50,
    metadata: { cures: ["poison", "disease",], },
  },
];

/** Weapon loot by rarity */
export const WEAPON_LOOT: LootEntry[] = [
  {
    name: "Iron Sword",
    description: "A sturdy iron longsword.",
    type: "weapon",
    rarity: "common",
    weight: 10,
    minQuantity: 1,
    maxQuantity: 1,
    minLevel: 1,
    goldValue: 15,
    metadata: { damage: "1d8", damageType: "slashing", },
  },
  {
    name: "Steel Longsword",
    description: "A well-crafted steel longsword with a sharp edge.",
    type: "weapon",
    rarity: "uncommon",
    weight: 6,
    minQuantity: 1,
    maxQuantity: 1,
    minLevel: 3,
    goldValue: 150,
    metadata: { damage: "1d8+1", damageType: "slashing", bonus: 1, },
  },
  {
    name: "Flame Tongue",
    description: "A blade that ignites with magical fire when wielded.",
    type: "weapon",
    rarity: "rare",
    weight: 2,
    minQuantity: 1,
    maxQuantity: 1,
    minLevel: 8,
    goldValue: 5000,
    metadata: { damage: "1d8+2", damageType: "fire", bonus: 2, },
  },
  {
    name: "Vorpal Sword",
    description: "A legendary blade that decapitates on critical hits.",
    type: "weapon",
    rarity: "legendary",
    weight: 1,
    minQuantity: 1,
    maxQuantity: 1,
    minLevel: 15,
    goldValue: 50_000,
    metadata: { damage: "1d8+3", damageType: "slashing", bonus: 3, vorpal: true, },
  },
];

/** Armor loot by rarity */
export const ARMOR_LOOT: LootEntry[] = [
  {
    name: "Leather Armor",
    description: "Basic leather armor offering minimal protection.",
    type: "armor",
    rarity: "common",
    weight: 10,
    minQuantity: 1,
    maxQuantity: 1,
    minLevel: 1,
    goldValue: 10,
    metadata: { ac: 11, type: "light", },
  },
  {
    name: "Chain Mail",
    description: "Interlocking metal rings providing solid protection.",
    type: "armor",
    rarity: "uncommon",
    weight: 6,
    minQuantity: 1,
    maxQuantity: 1,
    minLevel: 5,
    goldValue: 300,
    metadata: { ac: 16, type: "heavy", },
  },
  {
    name: "Dragon Scale Mail",
    description: "Armor crafted from dragon scales, resistant to fire.",
    type: "armor",
    rarity: "rare",
    weight: 2,
    minQuantity: 1,
    maxQuantity: 1,
    minLevel: 10,
    goldValue: 10_000,
    metadata: { ac: 17, type: "heavy", resistances: ["fire",], },
  },
];

/**
 * Item → Battle Equipment Mapping
 *
 * Maps unified `ItemCategory`/`ItemRarity` world items into battle
 * `EquipmentItem` shapes: category→type/slot adapters and a
 * `toEquipmentItem` builder that decodes stat modifiers from
 * item `properties` JSON.
 */
import type { ItemCategory, ItemRarity, } from "../db/enums";
import type {
  CombatStats,
  EquipmentModifier,
  EquipmentSlot,
} from "./integration-schemas";

/** Item type */
export type ItemType =
  | "weapon"
  | "armor"
  | "helmet"
  | "boots"
  | "gloves"
  | "accessory"
  | "shield"
  | "consumable"
  | "material"
  | "quest";

/** Map a unified `ItemCategory` to a battle `ItemType` (best-effort). */
export function categoryToType(category: ItemCategory,): ItemType {
  switch (category) {
    case "weapon":
      return "weapon";
    case "armor":
      return "armor";
    case "consumable":
      return "consumable";
    case "material":
      return "material";
    case "key_item":
    case "quest_item":
      return "quest";
    case "tool":
    case "container":
    case "treasure":
    case "book":
    case "artifact":
    case "misc":
    case "other":
      return "accessory";
  }
}

/** Map a unified `ItemCategory` to an equipment slot (or undefined). */
export function categoryToSlot(category: ItemCategory,): EquipmentSlot | undefined {
  switch (category) {
    case "weapon":
      return "weapon";
    case "armor":
      return "armor";
    default:
      return undefined;
  }
}

/** Equipment item */
export interface EquipmentItem {
  /** Item ID */
  id: string;
  /** Item name */
  name: string;
  /** Item type */
  type: ItemType;
  /** Equipment slot (if equippable) */
  slot?: EquipmentSlot;
  /** Item rarity */
  rarity: ItemRarity;
  /** Stat modifiers when equipped */
  modifiers: EquipmentModifier[];
  /** Durability (0-100) */
  durability: number;
  /** Maximum durability */
  maxDurability: number;
  /** Whether item is currently equipped */
  equipped: boolean;
  /** Required level to equip */
  requiredLevel: number;
  /** Required stats to equip */
  requiredStats?: Partial<CombatStats>;
  /** Item description */
  description: string;
}

/** Source shape for building an `EquipmentItem` (subset of a world item definition). */
export interface EquipmentSource {
  id: string;
  name: string;
  description: string;
  category: ItemCategory;
  rarity: ItemRarity;
  properties: Record<string, unknown>;
}

/**
 * Build an `EquipmentItem` from a world item definition source.
 *
 * Stat modifiers are decoded from `properties` JSON:
 *   { damage, ac, bonus, damageType, resistances, ... }
 * `damage`/`bonus` map to `attack`; `ac` maps to `defense`; optional
 * `requiredLevel`/`requiredStats` carry equip requirements.
 */
export function toEquipmentItem(def: EquipmentSource,): EquipmentItem {
  const props = def.properties ?? {};
  const slot = categoryToSlot(def.category,);
  const modifiers: EquipmentModifier[] = [];

  const damage = typeof props.damage === "number" ? props.damage : undefined;
  const ac = typeof props.ac === "number" ? props.ac : undefined;
  const bonus = typeof props.bonus === "number" ? props.bonus : undefined;

  if (typeof damage === "number" && damage !== 0) {
    modifiers.push({ stat: "attack", value: damage, },);
  }
  if (typeof bonus === "number" && bonus !== 0) {
    modifiers.push({ stat: "attack", value: bonus, },);
  }
  if (typeof ac === "number" && ac !== 0) {
    modifiers.push({ stat: "defense", value: ac, },);
  }

  const requiredLevel = typeof props.requiredLevel === "number" ? props.requiredLevel : 1;
  const requiredStats = props.requiredStats as Partial<CombatStats> | undefined;

  return {
    id: def.id,
    name: def.name,
    type: categoryToType(def.category,),
    slot,
    rarity: def.rarity,
    modifiers,
    durability: 100,
    maxDurability: 100,
    equipped: false,
    requiredLevel,
    requiredStats,
    description: def.description,
  };
}

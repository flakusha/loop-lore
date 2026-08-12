import type { ItemRarity, } from "../../db/enums";

/** Item rarity tiers — unified with the canonical `ItemRarity` enum. */
export type Rarity = ItemRarity;

/** Loot table entry */
export interface LootEntry {
  /** Item name */
  name: string;
  /** Item description */
  description: string;
  /** Item type (weapon, armor, consumable, etc.) */
  type: string;
  /** Rarity */
  rarity: Rarity;
  /** Optional existing item definition ID to persist as (else created on-the-fly) */
  itemId?: string;
  /** Drop weight (higher = more likely) */
  weight: number;
  /** Minimum quantity */
  minQuantity: number;
  /** Maximum quantity */
  maxQuantity: number;
  /** Required character level to drop */
  minLevel: number;
  /** Item value in gold */
  goldValue: number;
  /** Item metadata */
  metadata: Record<string, unknown>;
}

/** Generated loot result */
export interface LootDrop {
  /** Item name */
  name: string;
  /** Description */
  description: string;
  /** Type */
  type: string;
  /** Rarity */
  rarity: Rarity;
  /** Optional item definition ID the drop maps to */
  itemId?: string;
  /** Quantity rolled */
  quantity: number;
  /** Gold value per unit */
  goldValue: number;
  /** Total gold value */
  totalGoldValue: number;
  /** Item metadata */
  metadata: Record<string, unknown>;
}

/** Complete loot generation result */
export interface LootResult {
  /** All items dropped */
  drops: LootDrop[];
  /** Total gold value of all drops */
  totalGoldValue: number;
  /** Whether a rare+ item was found */
  hasRareDrop: boolean;
  /** World item instance IDs created after persistence (empty until persisted) */
  worldItemIds: string[];
}

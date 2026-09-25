// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Items Service — Types
 *
 * Item definition / instance shapes and transfer result type.
 */
import type { Kysely, } from "kysely";
import type { ItemCategory, ItemRarity, ItemVisibility, } from "../../db/enums";
import type { DB, } from "../../db/schema";

// ── Shared dispatcher state ─────────────────────────────────

/** Mutable view of the items service's db handle threaded to dispatchers */
export interface ItemState {
  db: Kysely<DB>;
}

/** */
export interface ItemDefinition {
  worldId: string;
  name: string;
  description: string;
  category: ItemCategory;
  rarity: ItemRarity;
  stackable: boolean;
  maxStack: number;
  properties: Record<string, unknown>;
  value: number;
  weight: number;
}

/** Durability override used when creating a world-item instance. */
export interface DurabilityOverride {
  current: number;
  max?: number;
}

/** Result of applying durability wear to an instance. */
export interface DurabilityResult {
  remaining: number | null;
  broken: boolean;
}

/** A combat or crafting event that can evolve an instance's stats. */
export interface ItemDriftEvent {
  stat: string;
  amount: number;
  battleUses?: number;
}

/** Per-instance stat drift persisted in world_items.properties.drift. */
export interface ItemDrift {
  statMultipliers: Record<string, number>;
  battleUses: number;
  lastDriftAt: string;
}

/** Raised when a unique definition already has an instance in its world. */
export class UniqueItemAlreadyExistsError extends Error {
  constructor(public readonly existingWorldItemId: string,) {
    super(`Unique item already exists in this world: ${existingWorldItemId}`,);
    this.name = "UniqueItemAlreadyExistsError";
  }
}

/** Raised when an item definition is used from the wrong world. */
export class ItemWorldMismatchError extends Error {
  constructor(itemId: string, worldId: string,) {
    super(`Item ${itemId} is not available in world ${worldId}`,);
    this.name = "ItemWorldMismatchError";
  }
}

/** */
export interface ItemInstance {
  worldItemId: string;
  itemId: string;
  name: string;
  description: string;
  category: ItemCategory;
  rarity: ItemRarity;
  quantity: number;
  properties: Record<string, unknown>;
  value: number;
  weight: number;
  visibility: ItemVisibility;
  worldId?: string;
  isActive?: boolean;
  currentDurability?: number | null;
  maxDurability?: number | null;
}

/** */
export interface TransferResult {
  success: boolean;
  fromRemaining: number;
  toQuantity: number;
  transferred: number;
}

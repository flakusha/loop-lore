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
}

/** */
export interface TransferResult {
  success: boolean;
  fromRemaining: number;
  toQuantity: number;
  transferred: number;
}

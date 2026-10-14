// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Items Service
 *
 * Manage item definitions (templates) and world item instances
 * placed in locations or carried by NPCs.
 *
 * Method bodies live in sibling dispatcher modules (definitions)
 * threaded with an explicit `ItemState` handle. The class is kept so
 * the constructor-based public surface is unchanged.
 */
import type { Kysely, Transaction, } from "kysely";
import type { ItemCategory, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import {
  createDefinition as createDefinitionDispatch,
  getDefinition as getDefinitionDispatch,
  listDefinitions as listDefinitionsDispatch,
} from "./definitions";
import {
  applyDrift as applyDriftDispatch,
  decrementDurability as decrementDurabilityDispatch,
  destroy as destroyDispatch,
  getAtLocation as getAtLocationDispatch,
  getNpcInventory as getNpcInventoryDispatch,
  getNpcInventoryBatch as getNpcInventoryBatchDispatch,
  getUniqueItem as getUniqueItemDispatch,
  giveToNpc as giveToNpcDispatch,
  placeInLocation as placeInLocationDispatch,
  transfer as transferDispatch,
} from "./instances";
import type {
  DurabilityOverride,
  DurabilityResult,
  ItemDefinition,
  ItemDrift,
  ItemDriftEvent,
  ItemInstance,
  ItemState,
  TransferResult,
} from "./types";

export { ITEM_POWER_BUDGETS, ItemPowerBudgetError, powerBudgetFor, validateItemPower, } from "./balance";
export type { ItemPowerBudget, ItemPowerResult, } from "./balance";
export { InvalidItemEffectsError, } from "./effects";
export type { ItemEffect, } from "./effects";
export { DuplicateItemDefinitionError, ItemWorldMismatchError, UniqueItemAlreadyExistsError, } from "./types";

export type {
  DurabilityOverride,
  DurabilityResult,
  ItemDefinition,
  ItemDrift,
  ItemDriftEvent,
  ItemInstance,
  ItemState,
  TransferResult,
} from "./types";

// ── Service ───────────────────────────────────────────────────

/** */
export class ItemsService {
  private readonly db: Kysely<DB>;

  constructor(db: Kysely<DB>,) {
    this.db = db;
  }

  /** */
  private get state(): ItemState {
    return { db: this.db, };
  }

  /**
   * Create a new item definition
   * @param def
   * @returns the id of the newly created definition
   */
  async createDefinition(def: ItemDefinition,): Promise<string> {
    return createDefinitionDispatch(this.state, def,);
  }

  /**
   * Get item definition by ID. Requires worldId to prevent cross-world IDOR.
   * @param itemId
   * @param worldId
   * @returns the item row, or null if not found
   */
  async getDefinition(itemId: string, worldId: string,) {
    return getDefinitionDispatch(this.state, itemId, worldId,);
  }

  /**
   * List item definitions in a world
   * @param worldId
   * @param category
   * @returns all item rows in the world, optionally filtered by category
   */
  async listDefinitions(worldId: string, category?: ItemCategory,) {
    return listDefinitionsDispatch(this.state, worldId, category,);
  }

  /**
   * Place item instance in a location
   * @param itemId
   * @param locationId
   * @param worldId
   * @param quantity
   * @param hidden
   * @param respawnable
   * @param spawnCondition
   * @param durability
   * @returns the world_item id of the placed item
   */
  async placeInLocation(
    itemId: string,
    locationId: string,
    worldId: string,
    quantity = 1,
    hidden = false,
    respawnable = false,
    spawnCondition?: Record<string, unknown>,
    durability?: DurabilityOverride,
  ): Promise<string> {
    return placeInLocationDispatch(
      this.state,
      itemId,
      locationId,
      worldId,
      quantity,
      hidden,
      respawnable,
      spawnCondition,
      durability,
    );
  }

  /**
   * Give item instance to an NPC
   * @param itemId
   * @param actorId
   * @param worldId
   * @param quantity
   * @param durability
   * @returns the world_item id of the given item
   */
  async giveToNpc(
    itemId: string,
    actorId: string,
    worldId: string,
    quantity = 1,
    durability?: DurabilityOverride,
  ): Promise<string> {
    return giveToNpcDispatch(this.state, itemId, actorId, worldId, quantity, durability,);
  }

  /**
   * Get items at a location
   * @param locationId
   * @param worldId
   * @param includeHidden
   * @returns all item instances at the location, optionally including hidden ones
   */
  async getAtLocation(locationId: string, worldId: string, includeHidden = false,) {
    return getAtLocationDispatch(this.state, locationId, worldId, includeHidden,);
  }

  /**
   * Get items carried by an NPC
   * @param actorId
   * @param worldId
   * @returns all item instances owned by the NPC in this world
   */
  async getNpcInventory(actorId: string, worldId: string,) {
    return getNpcInventoryDispatch(this.state, actorId, worldId,);
  }

  /**
   * Get items carried by multiple NPCs in one query (avoids N+1).
   * Returns actorId -> inventory. BUG-n-1-queries-in-story-world-state-context-per-participant.
   * @param actorIds
   * @param worldId
   * @returns a map of actorId to their inventory of item instances
   */
  async getNpcInventoryBatch(actorIds: string[], worldId: string,): Promise<Map<string, ItemInstance[]>> {
    return getNpcInventoryBatchDispatch(this.state, actorIds, worldId,);
  }

  /**
   * @param worldItemId
   * @param worldId
   * @param amount
   * @param trx
   * @returns the durability after the decrement, including damage dealt
   */
  async decrementDurability(
    worldItemId: string,
    worldId: string,
    amount: number,
    trx?: Transaction<DB>,
  ): Promise<DurabilityResult> {
    return decrementDurabilityDispatch(this.state, worldItemId, worldId, amount, trx,);
  }

  /**
   * @param worldItemId
   * @param worldId
   * @param event
   * @param trx
   * @returns the updated drift state, or null if the item was not found
   */
  async applyDrift(
    worldItemId: string,
    worldId: string,
    event: ItemDriftEvent,
    trx?: Transaction<DB>,
  ): Promise<ItemDrift | null> {
    return applyDriftDispatch(this.state, worldItemId, worldId, event, trx,);
  }

  /**
   * @param itemId
   * @param worldId
   * @returns the active world_item row for this unique item, or null
   */
  async getUniqueItem(itemId: string, worldId: string,) {
    return getUniqueItemDispatch(this.state, itemId, worldId,);
  }

  /**
   * Transfer items between locations, NPCs, or from world to actor. Requires worldId to prevent cross-world IDOR.
   * @param worldItemId
   * @param worldId
   * @param quantity
   * @param toLocationId
   * @param toActorId
   * @param trx
   * @returns the outcome of the transfer including remaining quantity
   */
  async transfer(
    worldItemId: string,
    worldId: string,
    quantity: number,
    toLocationId?: string,
    toActorId?: string,
    trx?: Transaction<DB>,
  ): Promise<TransferResult> {
    return transferDispatch(this.state, worldItemId, worldId, quantity, toLocationId, toActorId, trx,);
  }

  /**
   * Remove item instance. Requires worldId to prevent cross-world IDOR.
   * @param worldItemId
   * @param worldId
   * @param quantity
   * @param trx
   * @returns true if the item was fully destroyed, false if insufficient quantity existed
   */
  async destroy(worldItemId: string, worldId: string, quantity?: number, trx?: Transaction<DB>,): Promise<boolean> {
    return destroyDispatch(this.state, worldItemId, worldId, quantity, trx,);
  }
}

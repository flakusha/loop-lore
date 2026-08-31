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
  destroy as destroyDispatch,
  getAtLocation as getAtLocationDispatch,
  getNpcInventory as getNpcInventoryDispatch,
  giveToNpc as giveToNpcDispatch,
  placeInLocation as placeInLocationDispatch,
  transfer as transferDispatch,
} from "./instances";
import type { ItemDefinition, ItemState, TransferResult, } from "./types";

export type {
  ItemDefinition,
  ItemInstance,
  ItemState,
  TransferResult,
} from "./types";

// ── Service ───────────────────────────────────────────────────

/** */
export class ItemsService {
  private readonly db: Kysely<DB>;

  /**
   * @param db
   */
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
   */
  async createDefinition(def: ItemDefinition,): Promise<string> {
    return createDefinitionDispatch(this.state, def,);
  }

  /** Get item definition by ID */
  /**
   * Get item definition by ID. Requires worldId to prevent cross-world IDOR.
   * @param itemId
   * @param worldId
   */
  async getDefinition(itemId: string, worldId: string,) {
    return getDefinitionDispatch(this.state, itemId, worldId,);
  }

  /**
   * List item definitions in a world
   * @param worldId
   * @param category
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
   */
  async placeInLocation(
    itemId: string,
    locationId: string,
    worldId: string,
    quantity = 1,
    hidden = false,
    respawnable = false,
    spawnCondition?: Record<string, unknown>,
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
    );
  }

  /**
   * Give item instance to an NPC
   * @param itemId
   * @param actorId
   * @param worldId
   * @param quantity
   */
  async giveToNpc(itemId: string, actorId: string, worldId: string, quantity = 1,): Promise<string> {
    return giveToNpcDispatch(this.state, itemId, actorId, worldId, quantity,);
  }

  /**
   * Get items at a location
   * @param locationId
   * @param includeHidden
   */
  async getAtLocation(locationId: string, includeHidden = false,) {
    return getAtLocationDispatch(this.state, locationId, includeHidden,);
  }

  /**
   * Get items carried by an NPC
   * @param actorId
   */
  async getNpcInventory(actorId: string,) {
    return getNpcInventoryDispatch(this.state, actorId,);
  }

  /**
   * Transfer items between locations, NPCs, or from world to actor. Requires worldId to prevent cross-world IDOR.
   * @param worldItemId
   * @param worldId
   * @param quantity
   * @param toLocationId
   * @param toActorId
   * @param trx
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
   */
  async destroy(worldItemId: string, worldId: string, quantity?: number, trx?: Transaction<DB>,): Promise<boolean> {
    return destroyDispatch(this.state, worldItemId, worldId, quantity, trx,);
  }
}

/**
 * Items Service
 *
 * Manage item definitions (templates) and world item instances
 * placed in locations or carried by NPCs.
 */
import type { Kysely, Transaction } from "kysely";
import type { DB } from "../db/schema";
import type { ItemCategory, ItemRarity } from "../db/enums";
import { ItemVisibility } from "../db/enums";
import { uid } from "../utils";

// ── Item Definition Helpers ───────────────────────────────────

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

export interface TransferResult {
  success: boolean;
  fromRemaining: number;
  toQuantity: number;
  transferred: number;
}

// ── Service ───────────────────────────────────────────────────

export class ItemsService {
  constructor(private readonly db: Kysely<DB>) {}

  /** Create a new item definition */
  async createDefinition(def: ItemDefinition): Promise<string> {
    const id = uid();
    await this.db
      .insertInto("items")
      .values({
        id,
        world_id: def.worldId,
        name: def.name,
        description: def.description,
        category: def.category,
        rarity: def.rarity,
        stackable: def.stackable ? 1 : 0,
        max_stack: def.maxStack,
        properties: JSON.stringify(def.properties),
        value: def.value,
        weight: def.weight,
      })
      .execute();
    return id;
  }

  /** Get item definition by ID */
  async getDefinition(itemId: string) {
    return this.db.selectFrom("items").selectAll().where("id", "=", itemId).executeTakeFirst();
  }

  /** List item definitions in a world */
  async listDefinitions(worldId: string, category?: ItemCategory) {
    let query = this.db.selectFrom("items").selectAll().where("world_id", "=", worldId);

    if (category) {
      query = query.where("category", "=", category);
    }

    return query.execute();
  }

  /** Place item instance in a location */
  async placeInLocation(
    itemId: string,
    locationId: string,
    worldId: string,
    quantity = 1,
    hidden = false,
    respawnable = false,
    spawnCondition?: Record<string, unknown>,
  ): Promise<string> {
    const id = uid();
    await this.db
      .insertInto("world_items")
      .values({
        id,
        world_id: worldId,
        item_id: itemId,
        location_id: locationId,
        quantity,
        visibility: hidden ? ItemVisibility.Hidden : ItemVisibility.Visible,
        respawnable: respawnable ? 1 : 0,
        spawn_condition: spawnCondition ? JSON.stringify(spawnCondition) : null,
      })
      .execute();
    return id;
  }

  /** Give item instance to an NPC */
  async giveToNpc(itemId: string, actorId: string, worldId: string, quantity = 1): Promise<string> {
    const id = uid();
    await this.db
      .insertInto("world_items")
      .values({
        id,
        world_id: worldId,
        item_id: itemId,
        owner_actor_id: actorId,
        quantity,
      } as any)
      .execute();
    return id;
  }

  /** Get items at a location */
  async getAtLocation(locationId: string, includeHidden = false) {
    let query = this.db
      .selectFrom("world_items")
      .innerJoin("items", "items.id", "world_items.item_id")
      .select([
        "world_items.id as world_item_id",
        "world_items.item_id",
        "world_items.quantity",
        "world_items.visibility",
        "world_items.location_id",
        "world_items.owner_actor_id",
        "items.name",
        "items.description",
        "items.category",
        "items.rarity",
        "items.properties",
        "items.value",
        "items.weight",
      ])
      .where("world_items.location_id", "=", locationId);

    if (!includeHidden) {
      query = query.where("world_items.visibility", "=", "visible");
    }

    return query.execute();
  }

  /** Get items carried by an NPC */
  async getNpcInventory(actorId: string) {
    return this.db
      .selectFrom("world_items")
      .innerJoin("items", "items.id", "world_items.item_id")
      .select([
        "world_items.id as world_item_id",
        "world_items.item_id",
        "world_items.quantity",
        "world_items.owner_actor_id",
        "items.name",
        "items.description",
        "items.category",
        "items.rarity",
        "items.properties",
        "items.value",
        "items.weight",
      ])
      .where("world_items.owner_actor_id", "=", actorId)
      .execute();
  }

  /** Transfer items between locations, NPCs, or from world to actor */
  async transfer(
    worldItemId: string,
    quantity: number,
    toLocationId?: string,
    toActorId?: string,
    trx?: Transaction<DB>,
  ): Promise<TransferResult> {
    const db = trx ?? this.db;

    const source = await db
      .selectFrom("world_items")
      .selectAll()
      .where("id", "=", worldItemId)
      .executeTakeFirst();

    if (!source) {
      return { success: false, fromRemaining: 0, toQuantity: 0, transferred: 0 };
    }

    const actualTransfer = Math.min(quantity, source.quantity);
    const remaining = source.quantity - actualTransfer;

    if (remaining <= 0) {
      // Transfer all — update row with new owner
      await db
        .updateTable("world_items")
        .set({
          quantity: 0,
          location_id: toLocationId ?? null,
          owner_actor_id: toActorId ?? null,
        })
        .where("id", "=", worldItemId)
        .execute();
    } else {
      // Partial — reduce source
      await db
        .updateTable("world_items")
        .set({ quantity: remaining })
        .where("id", "=", worldItemId)
        .execute();
    }

    // Create or add to destination
    if (toLocationId || toActorId) {
      let query = db
        .selectFrom("world_items")
        .selectAll()
        .where("item_id", "=", source.item_id)
        .where("world_id", "=", source.world_id);

      if (toLocationId) {
        query = query.where("location_id", "=", toLocationId);
      } else if (toActorId) {
        query = query.where("owner_actor_id", "=", toActorId);
      }

      const existing = await query.executeTakeFirst();

      if (existing) {
        await db
          .updateTable("world_items")
          .set({ quantity: existing.quantity + actualTransfer })
          .where("id", "=", existing.id)
          .execute();
      } else {
        await db
          .insertInto("world_items")
          .values({
            id: uid(),
            world_id: source.world_id,
            item_id: source.item_id,
            location_id: toLocationId ?? null,
            owner_actor_id: toActorId ?? null,
            quantity: actualTransfer,
          } as any) // Kysely strict inference workaround
          .execute();
      }
    }

    return {
      success: true,
      fromRemaining: remaining,
      toQuantity: actualTransfer,
      transferred: actualTransfer,
    };
  }

  /** Remove item instance */
  async destroy(worldItemId: string, quantity?: number, trx?: Transaction<DB>): Promise<boolean> {
    const db = trx ?? this.db;

    if (quantity === undefined) {
      await db.deleteFrom("world_items").where("id", "=", worldItemId).execute();
      return true;
    }

    const source = await db
      .selectFrom("world_items")
      .selectAll()
      .where("id", "=", worldItemId)
      .executeTakeFirst();

    if (!source) return false;

    const remaining = source.quantity - quantity;
    if (remaining <= 0) {
      await db.deleteFrom("world_items").where("id", "=", worldItemId).execute();
    } else {
      await db
        .updateTable("world_items")
        .set({ quantity: remaining })
        .where("id", "=", worldItemId)
        .execute();
    }

    return true;
  }
}

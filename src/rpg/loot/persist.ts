// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Loot Persistence Bridge
 *
 * Turns generated `LootDrop[]` into real `world_items` instances so loot can
 * be picked up, traded, or stored. For drops that reference an existing item
 * definition (`entry.itemId`), the instance is created against that
 * definition; anonymous drops get a definition created on-the-fly from the
 * drop's name/type/rarity/metadata.
 */
import type { Kysely, } from "kysely";
import { ItemCategory, ItemRarity, StackableState, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { ItemsService, } from "../../story/items";
import { safeJsonParse, safeJsonStringify, uid, } from "../../utils";
import type { LootDrop, LootResult, } from "./types";

/** Where a loot drop should be persisted. */
export interface LootDestination {
  /** World the items belong to. */
  worldId: string;
  /** NPC actor to grant to (giveToNpc). Exclusive with `locationId`. */
  actorId?: string;
  /** Location to place at (placeInLocation). Exclusive with `actorId`. */
  locationId?: string;
  /** Default item category for on-the-fly definitions. */
  defaultCategory?: ItemCategory;
  /**
   * Idempotency key for this reward batch (unique per world). When set and
   * already persisted, `persistLoot` resolves the recorded instance ids
   * without writing anything.
   */
  ledgerKey?: string;
}

/** Map loose loot `type` strings onto canonical `ItemCategory` values. */
const LOOSE_TYPE_TO_CATEGORY: Record<string, ItemCategory> = {
  weapon: ItemCategory.Weapon,
  armor: ItemCategory.Armor,
  helmet: ItemCategory.Armor,
  boots: ItemCategory.Armor,
  gloves: ItemCategory.Armor,
  shield: ItemCategory.Armor,
  consumable: ItemCategory.Consumable,
  potion: ItemCategory.Consumable,
  material: ItemCategory.Material,
  ingredient: ItemCategory.Material,
  key: ItemCategory.KeyItem,
  key_item: ItemCategory.KeyItem,
  quest: ItemCategory.QuestItem,
  quest_item: ItemCategory.QuestItem,
  tool: ItemCategory.Tool,
  treasure: ItemCategory.Treasure,
  gold: ItemCategory.Treasure,
  book: ItemCategory.Book,
  artifact: ItemCategory.Artifact,
  misc: ItemCategory.Misc,
} as const;

/**
 * Map a loose loot `type` string to a unified `ItemCategory`.
 * @param type
 * @param fallback
 */
function toCategory(type: string, fallback: ItemCategory,): ItemCategory {
  const value = type.toLowerCase().trim();
  return LOOSE_TYPE_TO_CATEGORY[value] ??
    (Object.values(ItemCategory,).includes(value as ItemCategory,) ? (value as ItemCategory) : fallback);
}

/**
 * Persist a set of loot drops as world item instances.
 *
 * With `dest.ledgerKey` set, persistence is idempotent: a previously
 * persisted key resolves to the recorded instance ids and nothing is
 * written. Otherwise all drops are persisted inside a single transaction —
 * a failure rolls back every partial `world_items` row.
 * @param db
 * @param result
 * @param dest
 */
export async function persistLoot(
  db: Kysely<DB>,
  result: LootResult,
  dest: LootDestination,
): Promise<LootResult> {
  const category = dest.defaultCategory ?? ItemCategory.Other;

  // Reward-ledger dedupe: a persisted key short-circuits to the recorded
  // instance ids (TASK-049 idempotency contract).
  if (dest.ledgerKey) {
    const existing = await db
      .selectFrom("quest_reward_ledger",)
      .select("world_item_ids",)
      .where("world_id", "=", dest.worldId,)
      .where("ledger_key", "=", dest.ledgerKey,)
      .executeTakeFirst();
    if (existing) {
      const parsed = safeJsonParse<string[]>(existing.world_item_ids,);
      return { ...result, worldItemIds: parsed.ok ? parsed.value : [], };
    }
  }

  const worldItemIds = await db.transaction().execute(async (trx,) => {
    const items = new ItemsService(trx,);
    const ids: string[] = [];
    for (const drop of result.drops) {
      ids.push(...(await persistDrop(items, drop, dest, category,)),);
    }
    if (dest.ledgerKey) {
      const serialized = safeJsonStringify(ids,);
      await trx
        .insertInto("quest_reward_ledger",)
        .values({
          id: uid(),
          world_id: dest.worldId,
          ledger_key: dest.ledgerKey,
          world_item_ids: serialized.ok ? serialized.value : "[]",
        },)
        .execute();
    }
    return ids;
  },);

  // Return a fresh object — do not mutate the caller's `result`.
  return { ...result, worldItemIds, };
}

/**
 * Split a drop quantity into per-instance quantities bounded by the
 * definition's `max_stack` (unique items are capped at 1 per instance).
 * @param quantity
 * @param maxStack
 */
function chunkQuantity(quantity: number, maxStack: number,): number[] {
  const size = Math.max(1, Math.floor(maxStack,),);
  const chunks: number[] = [];
  let remaining = Math.max(1, Math.floor(quantity,),);
  while (remaining > 0) {
    const take = Math.min(size, remaining,);
    chunks.push(take,);
    remaining -= take;
  }
  return chunks;
}

/**
 * Persist one loot drop, splitting it across instances per the definition's
 * stackable/unique semantics. Returns every created `world_items` id.
 * @param items
 * @param drop
 * @param dest
 * @param fallbackCategory
 */
async function persistDrop(
  items: ItemsService,
  drop: LootDrop,
  dest: LootDestination,
  fallbackCategory: ItemCategory,
): Promise<string[]> {
  // Resolve (or create) the item definition id.
  let definitionId = drop.itemId;
  if (!definitionId) {
    definitionId = await items.createDefinition({
      worldId: dest.worldId,
      name: drop.name,
      description: drop.description,
      category: toCategory(drop.type, fallbackCategory,),
      rarity: drop.rarity,
      stackable: drop.quantity > 1,
      maxStack: Math.max(1, drop.quantity,),
      properties: { ...drop.metadata, loot: true, goldValue: drop.goldValue, },
      value: drop.goldValue,
      weight: 1,
    },);
  }

  // Reconcile quantity against the definition: stackable items split into
  // chunks of at most `max_stack`; unique items stay at quantity 1.
  const definition = await items.getDefinition(definitionId, dest.worldId,);
  if (!definition) {
    throw new Error(
      `persistLoot: item definition ${definitionId} not found in world ${dest.worldId}`,
    );
  }
  const maxStack = definition.stackable === StackableState.Stackable
    ? (definition.max_stack ?? 1)
    : 1;
  if (
    definition.stackable === StackableState.Unique &&
    (definition.rarity === ItemRarity.Unique || definition.rarity === ItemRarity.Artifact)
  ) {
    const existing = await items.getUniqueItem(definitionId, dest.worldId,);
    if (existing) { return [existing.id,]; }
  }
  const chunks = chunkQuantity(drop.quantity, maxStack,);

  // Grant to an NPC or place at a location — a destination is required so
  // drops land somewhere concrete (NPC inventory or a location).
  const ids: string[] = [];
  for (const quantity of chunks) {
    if (dest.actorId) {
      ids.push(await items.giveToNpc(definitionId, dest.actorId, dest.worldId, quantity,),);
    } else if (dest.locationId) {
      ids.push(await items.placeInLocation(definitionId, dest.locationId, dest.worldId, quantity,),);
    } else {
      throw new Error("persistLoot requires actorId or locationId",);
    }
  }
  return ids;
}

export { toCategory, };

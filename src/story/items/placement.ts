// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** World-scoped item placement and location lookup. */
import { ItemCategory, ItemRarity, ItemVisibility, StackableState, } from "../../db/enums";
import { safeJsonStringify, uid, } from "../../utils";
import type { DurabilityOverride, ItemState, } from "./types";
import { ItemWorldMismatchError, UniqueItemAlreadyExistsError, } from "./types";

async function requireDefinition(state: ItemState, itemId: string, worldId: string,) {
  const definition = await state.db
    .selectFrom("items",)
    .selectAll()
    .where("id", "=", itemId,)
    .where("world_id", "=", worldId,)
    .executeTakeFirst();
  if (!definition) { throw new ItemWorldMismatchError(itemId, worldId,); }
  return definition;
}

async function requireUniqueSlot(state: ItemState, itemId: string, worldId: string,): Promise<void> {
  const existing = await state.db
    .selectFrom("world_items",)
    .innerJoin("items", "items.id", "world_items.item_id",)
    .select("world_items.id",)
    .where("world_items.world_id", "=", worldId,)
    .where("world_items.item_id", "=", itemId,)
    .where("items.stackable", "=", StackableState.Unique,)
    .where("items.rarity", "in", [ItemRarity.Unique, ItemRarity.Artifact,],)
    .executeTakeFirst();
  if (existing) { throw new UniqueItemAlreadyExistsError(existing.id,); }
}

function durabilityValues(
  definition: { category: ItemCategory; stackable: StackableState },
  override?: DurabilityOverride,
): { current: number | null; max: number | null } {
  if (definition.stackable === StackableState.Stackable || definition.category === ItemCategory.Consumable) {
    return { current: null, max: null, };
  }
  const requestedMax = override?.max ?? Math.max(override?.current ?? 0, 100,);
  const max = Number.isFinite(requestedMax,) ? Math.max(0, requestedMax,) : 100;
  const requestedCurrent = override?.current ?? max;
  const current = Number.isFinite(requestedCurrent,) ? Math.min(Math.max(0, requestedCurrent,), max,) : max;
  return { current, max, };
}

function encodeProperties(properties: Record<string, unknown>,): string {
  const result = safeJsonStringify(properties,);
  return result.ok ? result.value : "{}";
}

/**
 * Place item instance in a location
 * @param state
 * @param itemId
 * @param locationId
 * @param worldId
 * @param quantity
 * @param hidden
 * @param respawnable
 * @param spawnCondition
 */
export async function placeInLocation(
  state: ItemState,
  itemId: string,
  locationId: string,
  worldId: string,
  quantity = 1,
  hidden = false,
  respawnable = false,
  spawnCondition?: Record<string, unknown>,
  durability?: DurabilityOverride,
): Promise<string> {
  const definition = await requireDefinition(state, itemId, worldId,);
  const location = await state.db
    .selectFrom("locations",)
    .select("id",)
    .where("id", "=", locationId,)
    .where("world_id", "=", worldId,)
    .executeTakeFirst();
  if (!location) { throw new ItemWorldMismatchError(locationId, worldId,); }
  await requireUniqueSlot(state, itemId, worldId,);
  const id = uid();
  const durabilityState = durabilityValues(definition, durability,);
  await state.db
    .insertInto("world_items",)
    .values({
      id,
      world_id: worldId,
      item_id: itemId,
      location_id: locationId,
      quantity,
      visibility: hidden ? ItemVisibility.Hidden : ItemVisibility.Visible,
      respawnable: respawnable ? 1 : 0,
      spawn_condition: spawnCondition ? encodeProperties(spawnCondition,) : null,
      properties: "{}",
      max_durability: durabilityState.max,
      current_durability: durabilityState.current,
      is_active: durabilityState.current === 0 ? 0 : 1,
    },)
    .execute();
  return id;
}

/** Give item instance to an NPC. */
export async function giveToNpc(
  state: ItemState,
  itemId: string,
  actorId: string,
  worldId: string,
  quantity = 1,
  durability?: DurabilityOverride,
): Promise<string> {
  const definition = await requireDefinition(state, itemId, worldId,);
  await requireUniqueSlot(state, itemId, worldId,);
  const id = uid();
  const durabilityState = durabilityValues(definition, durability,);
  await state.db
    .insertInto("world_items",)
    .values({
      id,
      world_id: worldId,
      item_id: itemId,
      owner_actor_id: actorId,
      quantity,
      location_id: null,
      visibility: ItemVisibility.Visible,
      respawnable: 0,
      spawn_condition: null,
      properties: "{}",
      max_durability: durabilityState.max,
      current_durability: durabilityState.current,
      is_active: durabilityState.current === 0 ? 0 : 1,
    },)
    .execute();
  return id;
}

/**
 * Get items at a location
 * @param state
 * @param locationId
 * @param includeHidden
 */
export async function getAtLocation(state: ItemState, locationId: string, worldId: string, includeHidden = false,) {
  let query = state.db
    .selectFrom("world_items",)
    .innerJoin("items", "items.id", "world_items.item_id",)
    .select([
      "world_items.id as world_item_id",
      "world_items.item_id",
      "world_items.quantity",
      "world_items.visibility",
      "world_items.location_id",
      "world_items.owner_actor_id",
      "world_items.world_id",
      "world_items.properties as instance_properties",
      "world_items.current_durability",
      "world_items.max_durability",
      "world_items.is_active",
      "items.name",
      "items.description",
      "items.category",
      "items.rarity",
      "items.properties",
      "items.value",
      "items.weight",
    ],)
    .where("world_items.location_id", "=", locationId,)
    .where("world_items.world_id", "=", worldId,)
    .where("items.world_id", "=", worldId,);

  if (!includeHidden) {
    query = query.where("world_items.visibility", "=", "visible",);
  }

  return query.execute();
}

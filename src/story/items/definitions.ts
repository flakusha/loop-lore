// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Items Service — Definition Dispatchers
 *
 * CRUD over item definitions (templates): create, get, and list.
 */
import { StackableState, } from "../../db/enums";
import type { ItemCategory, } from "../../db/enums";
import { safeJsonStringify, uid, } from "../../utils";
import type { ItemDefinition, ItemState, } from "./types";

/** Create a new item definition */
export async function createDefinition(state: ItemState, def: ItemDefinition,): Promise<string> {
  const id = uid();
  await state.db
    .insertInto("items",)
    .values({
      id,
      world_id: def.worldId,
      name: def.name,
      description: def.description,
      category: def.category,
      rarity: def.rarity,
      stackable: def.stackable ? StackableState.Stackable : StackableState.Unique,
      max_stack: def.maxStack,
      properties: (() => {
        const r = safeJsonStringify(def.properties,);
        return r.ok ? r.value : "{}";
      })(),
      value: def.value,
      weight: def.weight,
    },)
    .execute();
  return id;
}

/** Get item definition by ID */
/** Get item definition by ID. Requires worldId to prevent cross-world IDOR. */
export async function getDefinition(state: ItemState, itemId: string, worldId: string,) {
  return state.db.selectFrom("items",).selectAll().where("id", "=", itemId,).where("world_id", "=", worldId,)
    .executeTakeFirst();
}

/** List item definitions in a world */
export async function listDefinitions(state: ItemState, worldId: string, category?: ItemCategory,) {
  let query = state.db.selectFrom("items",).selectAll().where("world_id", "=", worldId,);

  if (category) {
    query = query.where("category", "=", category,);
  }

  return query.execute();
}

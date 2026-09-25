// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Actor Items Service — typed CRUD over `actor_items` (per-actor inventory),
 * scoped to one actor. Defaults mirror the `actor-items` entity-routes
 * config.
 */
import type { Kysely, Selectable, Updateable, } from "kysely";
import { EquipState, type ItemCategory, } from "../db/enums";
import type { DB, } from "../db/schema";
import { jsonStringifyOr, uid, } from "../utils";
import { requireActorOwnership, } from "./access";
import type {
  ActorDeleteResult,
  ActorListOpts,
  ActorListResult,
  ActorMutationResult,
} from "./types";

/** A single `actor_items` row. */
export type ItemRow = Selectable<DB["actor_items"]>;

/** Payload for creating an item. `name` is required. */
export interface CreateItemInput {
  name: string;
  description?: string | null;
  itemType?: ItemCategory;
  quantity?: number;
  value?: number;
  weight?: number | null;
  /** Free-form tags; stored as a JSON string. */
  tags?: string[];
  /** Arbitrary item properties (damage, charges, …); stored as a JSON string. */
  metadata?: Record<string, unknown>;
  equipped?: boolean;
  sortOrder?: number;
}

/** Payload for updating an item; omitted fields are left untouched. */
export type UpdateItemInput = Partial<CreateItemInput>;

/** Options narrowing {@link listActorItems}. */
export interface ListItemsOpts extends ActorListOpts {
  itemType?: ItemCategory;
}

/**
 * List an actor's items (sort order, then newest first).
 * @param database - Database handle
 * @param actorId - Actor to list items for
 * @param userId - Authenticated requester id
 * @param userRole - Requester role
 * @param opts - Paging plus an optional item-type filter
 * @returns Paginated items or an error
 */
export async function listActorItems(
  database: Kysely<DB>,
  actorId: string,
  userId: string,
  userRole: string | null | undefined,
  opts: ListItemsOpts = {},
): Promise<ActorListResult<ItemRow>> {
  const denied = await requireActorOwnership(database, actorId, userId, userRole,);
  if (denied) { return denied; }

  const page = Math.max(1, opts.page ?? 1,);
  const pageSize = Math.max(1, opts.pageSize ?? 50,);

  let countQuery = database
    .selectFrom("actor_items",)
    .select(database.fn.countAll().as("total",),)
    .where("actor_id", "=", actorId,);
  let listQuery = database
    .selectFrom("actor_items",)
    .selectAll()
    .where("actor_id", "=", actorId,);
  if (opts.itemType) {
    countQuery = countQuery.where("item_type", "=", opts.itemType,);
    listQuery = listQuery.where("item_type", "=", opts.itemType,);
  }

  const countResult = await countQuery.executeTakeFirst();
  const items = await listQuery
    .orderBy("sort_order", "asc",)
    .orderBy("created_at", "desc",)
    .limit(pageSize,)
    .offset((page - 1) * pageSize,)
    .execute();

  return { ok: true, items, total: Number(countResult?.total ?? 0,), page, pageSize, };
}

/**
 * Create an item in an actor's inventory.
 * @param database - Database handle
 * @param actorId - Owning actor
 * @param userId - Authenticated requester id
 * @param userRole - Requester role
 * @param input - Item fields; `name` is required
 * @returns The created row or an error
 */
export async function createActorItem(
  database: Kysely<DB>,
  actorId: string,
  userId: string,
  userRole: string | null | undefined,
  input: CreateItemInput,
): Promise<ActorMutationResult<ItemRow>> {
  const denied = await requireActorOwnership(database, actorId, userId, userRole,);
  if (denied) { return denied; }
  if (input.name == null || input.name === "") {
    return { ok: false, code: "bad_request", message: "name is required", };
  }

  const id = uid();
  await database
    .insertInto("actor_items",)
    .values({
      id,
      actor_id: actorId,
      name: input.name,
      item_type: input.itemType ?? "misc",
      quantity: input.quantity ?? 1,
      value: input.value ?? 0,
      equipped: input.equipped ?? false
        ? EquipState.Equipped
        : EquipState.Unequipped,
      sort_order: input.sortOrder ?? 0,
      ...(input.description !== undefined ? { description: input.description, } : {}),
      ...(input.weight !== undefined ? { weight: input.weight, } : {}),
      ...(input.tags != null ? { tags: jsonStringifyOr(input.tags,), } : {}),
      ...(input.metadata != null
        ? { metadata: jsonStringifyOr(input.metadata,), }
        : {}),
    },)
    .execute();

  const entity = await database
    .selectFrom("actor_items",)
    .selectAll()
    .where("id", "=", id,)
    .executeTakeFirstOrThrow();
  return { ok: true, entity, };
}

/**
 * Update an item in place. The item must belong to the given actor.
 * @param database - Database handle
 * @param actorId - Owning actor
 * @param itemId - Item to update
 * @param userId - Authenticated requester id
 * @param userRole - Requester role
 * @param patch - Fields to change; omitted fields are untouched
 * @returns The updated row or an error
 */
export async function updateActorItem(
  database: Kysely<DB>,
  actorId: string,
  itemId: string,
  userId: string,
  userRole: string | null | undefined,
  patch: UpdateItemInput,
): Promise<ActorMutationResult<ItemRow>> {
  const denied = await requireActorOwnership(database, actorId, userId, userRole,);
  if (denied) { return denied; }

  const existing = await database
    .selectFrom("actor_items",)
    .selectAll()
    .where("id", "=", itemId,)
    .where("actor_id", "=", actorId,)
    .executeTakeFirst();
  if (!existing) {
    return { ok: false, code: "not_found", message: "Item not found", };
  }

  const updates: Updateable<DB["actor_items"]> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.name != null) { updates.name = patch.name; }
  if (patch.description !== undefined) { updates.description = patch.description; }
  if (patch.itemType != null) { updates.item_type = patch.itemType; }
  if (patch.quantity != null) { updates.quantity = patch.quantity; }
  if (patch.value != null) { updates.value = patch.value; }
  if (patch.weight !== undefined) { updates.weight = patch.weight; }
  if (patch.tags != null) { updates.tags = jsonStringifyOr(patch.tags,); }
  if (patch.metadata != null) {
    updates.metadata = jsonStringifyOr(patch.metadata,);
  }
  if (patch.equipped != null) {
    updates.equipped = patch.equipped
      ? EquipState.Equipped
      : EquipState.Unequipped;
  }
  if (patch.sortOrder != null) { updates.sort_order = patch.sortOrder; }

  if (Object.keys(updates,).length === 1) { return { ok: true, entity: existing, }; }

  await database
    .updateTable("actor_items",)
    .set(updates,)
    .where("id", "=", itemId,)
    .execute();

  const entity = await database
    .selectFrom("actor_items",)
    .selectAll()
    .where("id", "=", itemId,)
    .executeTakeFirstOrThrow();
  return { ok: true, entity, };
}

/**
 * Delete an item. The item must belong to the given actor.
 * @param database - Database handle
 * @param actorId - Owning actor
 * @param itemId - Item to delete
 * @param userId - Authenticated requester id
 * @param userRole - Requester role
 * @returns The deleted id or an error
 */
export async function deleteActorItem(
  database: Kysely<DB>,
  actorId: string,
  itemId: string,
  userId: string,
  userRole: string | null | undefined,
): Promise<ActorDeleteResult> {
  const denied = await requireActorOwnership(database, actorId, userId, userRole,);
  if (denied) { return denied; }

  const result = await database
    .deleteFrom("actor_items",)
    .where("id", "=", itemId,)
    .where("actor_id", "=", actorId,)
    .executeTakeFirst();
  if (!result || Number(result.numDeletedRows ?? 0,) === 0) {
    return { ok: false, code: "not_found", message: "Item not found", };
  }
  return { ok: true, id: itemId, };
}

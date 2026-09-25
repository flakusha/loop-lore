// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Actor Lore Entries Service — typed CRUD over `actor_lore_entries`
 * (character-card lorebook), scoped to one actor. Defaults mirror the
 * `actor-lore-entries` entity-routes config.
 */
import type { Kysely, Selectable, Updateable, } from "kysely";
import { LoreEntryStatus, LorePosition, } from "../db/enums";
import type { DB, } from "../db/schema";
import { jsonStringifyOr, uid, } from "../utils";
import { requireActorOwnership, } from "./access";
import type {
  ActorDeleteResult,
  ActorListOpts,
  ActorListResult,
  ActorMutationResult,
} from "./types";

/** A single `actor_lore_entries` row. */
export type LoreRow = Selectable<DB["actor_lore_entries"]>;

/** Payload for creating a lore entry. `content` is required. */
export interface CreateLoreInput {
  content: string;
  name?: string | null;
  /** Trigger keywords; stored as a JSON string. */
  keys?: string[];
  /** Secondary trigger keywords; stored as a JSON string. */
  secondaryKeys?: string[];
  selective?: number;
  caseSensitive?: number;
  enabled?: LoreEntryStatus;
  constant?: number;
  position?: LorePosition;
  insertionOrder?: number;
  priority?: number;
  comment?: string | null;
  sortOrder?: number;
  audienceScope?: string | null;
  worldId?: string | null;
}

/** Payload for updating a lore entry; omitted fields are left untouched. */
export type UpdateLoreInput = Partial<CreateLoreInput>;

/** Options narrowing {@link listActorLoreEntries}. */
export interface ListLoreOpts extends ActorListOpts {
  enabled?: LoreEntryStatus;
}

/**
 * List an actor's lore entries (sort order, then insertion order).
 * @param database - Database handle
 * @param actorId - Actor to list lore entries for
 * @param userId - Authenticated requester id
 * @param userRole - Requester role
 * @param opts - Paging plus an optional enabled-state filter
 * @returns Paginated lore entries or an error
 */
export async function listActorLoreEntries(
  database: Kysely<DB>,
  actorId: string,
  userId: string,
  userRole: string | null | undefined,
  opts: ListLoreOpts = {},
): Promise<ActorListResult<LoreRow>> {
  const denied = await requireActorOwnership(database, actorId, userId, userRole,);
  if (denied) { return denied; }

  const page = Math.max(1, opts.page ?? 1,);
  const pageSize = Math.max(1, opts.pageSize ?? 50,);

  let countQuery = database
    .selectFrom("actor_lore_entries",)
    .select(database.fn.countAll().as("total",),)
    .where("actor_id", "=", actorId,);
  let listQuery = database
    .selectFrom("actor_lore_entries",)
    .selectAll()
    .where("actor_id", "=", actorId,);
  if (opts.enabled) {
    countQuery = countQuery.where("enabled", "=", opts.enabled,);
    listQuery = listQuery.where("enabled", "=", opts.enabled,);
  }

  const countResult = await countQuery.executeTakeFirst();
  const items = await listQuery
    .orderBy("sort_order", "asc",)
    .orderBy("insertion_order", "asc",)
    .limit(pageSize,)
    .offset((page - 1) * pageSize,)
    .execute();

  return { ok: true, items, total: Number(countResult?.total ?? 0,), page, pageSize, };
}

/**
 * Create a lore entry for an actor.
 * @param database - Database handle
 * @param actorId - Owning actor
 * @param userId - Authenticated requester id
 * @param userRole - Requester role
 * @param input - Lore fields; `content` is required
 * @returns The created row or an error
 */
export async function createActorLoreEntry(
  database: Kysely<DB>,
  actorId: string,
  userId: string,
  userRole: string | null | undefined,
  input: CreateLoreInput,
): Promise<ActorMutationResult<LoreRow>> {
  const denied = await requireActorOwnership(database, actorId, userId, userRole,);
  if (denied) { return denied; }
  if (input.content == null || input.content === "") {
    return { ok: false, code: "bad_request", message: "content is required", };
  }

  const id = uid();
  await database
    .insertInto("actor_lore_entries",)
    .values({
      id,
      actor_id: actorId,
      content: input.content,
      selective: input.selective ?? 0,
      case_sensitive: input.caseSensitive ?? 0,
      enabled: input.enabled ?? LoreEntryStatus.Enabled,
      constant: input.constant ?? 0,
      position: input.position ?? LorePosition.BeforeChar,
      insertion_order: input.insertionOrder ?? 100,
      priority: input.priority ?? 100,
      sort_order: input.sortOrder ?? 0,
      ...(input.name !== undefined ? { name: input.name, } : {}),
      ...(input.keys != null ? { keys: jsonStringifyOr(input.keys,), } : {}),
      ...(input.secondaryKeys != null
        ? { secondary_keys: jsonStringifyOr(input.secondaryKeys,), }
        : {}),
      ...(input.comment !== undefined ? { comment: input.comment, } : {}),
      ...(input.audienceScope !== undefined
        ? { audience_scope: input.audienceScope, }
        : {}),
      ...(input.worldId !== undefined ? { world_id: input.worldId, } : {}),
    },)
    .execute();

  const entity = await database
    .selectFrom("actor_lore_entries",)
    .selectAll()
    .where("id", "=", id,)
    .executeTakeFirstOrThrow();
  return { ok: true, entity, };
}

/**
 * Update a lore entry in place. The entry must belong to the given actor.
 * @param database - Database handle
 * @param actorId - Owning actor
 * @param loreId - Lore entry to update
 * @param userId - Authenticated requester id
 * @param userRole - Requester role
 * @param patch - Fields to change; omitted fields are untouched
 * @returns The updated row or an error
 */
export async function updateActorLoreEntry(
  database: Kysely<DB>,
  actorId: string,
  loreId: string,
  userId: string,
  userRole: string | null | undefined,
  patch: UpdateLoreInput,
): Promise<ActorMutationResult<LoreRow>> {
  const denied = await requireActorOwnership(database, actorId, userId, userRole,);
  if (denied) { return denied; }

  const existing = await database
    .selectFrom("actor_lore_entries",)
    .selectAll()
    .where("id", "=", loreId,)
    .where("actor_id", "=", actorId,)
    .executeTakeFirst();
  if (!existing) {
    return { ok: false, code: "not_found", message: "Lore entry not found", };
  }

  const updates: Updateable<DB["actor_lore_entries"]> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.content != null) { updates.content = patch.content; }
  if (patch.name !== undefined) { updates.name = patch.name; }
  if (patch.keys != null) { updates.keys = jsonStringifyOr(patch.keys,); }
  if (patch.secondaryKeys != null) {
    updates.secondary_keys = jsonStringifyOr(patch.secondaryKeys,);
  }
  if (patch.selective != null) { updates.selective = patch.selective; }
  if (patch.caseSensitive != null) { updates.case_sensitive = patch.caseSensitive; }
  if (patch.enabled != null) { updates.enabled = patch.enabled; }
  if (patch.constant != null) { updates.constant = patch.constant; }
  if (patch.position != null) { updates.position = patch.position; }
  if (patch.insertionOrder != null) { updates.insertion_order = patch.insertionOrder; }
  if (patch.priority != null) { updates.priority = patch.priority; }
  if (patch.comment !== undefined) { updates.comment = patch.comment; }
  if (patch.sortOrder != null) { updates.sort_order = patch.sortOrder; }
  if (patch.audienceScope !== undefined) { updates.audience_scope = patch.audienceScope; }
  if (patch.worldId !== undefined) { updates.world_id = patch.worldId; }

  if (Object.keys(updates,).length === 1) { return { ok: true, entity: existing, }; }

  await database
    .updateTable("actor_lore_entries",)
    .set(updates,)
    .where("id", "=", loreId,)
    .execute();

  const entity = await database
    .selectFrom("actor_lore_entries",)
    .selectAll()
    .where("id", "=", loreId,)
    .executeTakeFirstOrThrow();
  return { ok: true, entity, };
}

/**
 * Delete a lore entry. The entry must belong to the given actor.
 * @param database - Database handle
 * @param actorId - Owning actor
 * @param loreId - Lore entry to delete
 * @param userId - Authenticated requester id
 * @param userRole - Requester role
 * @returns The deleted id or an error
 */
export async function deleteActorLoreEntry(
  database: Kysely<DB>,
  actorId: string,
  loreId: string,
  userId: string,
  userRole: string | null | undefined,
): Promise<ActorDeleteResult> {
  const denied = await requireActorOwnership(database, actorId, userId, userRole,);
  if (denied) { return denied; }

  const result = await database
    .deleteFrom("actor_lore_entries",)
    .where("id", "=", loreId,)
    .where("actor_id", "=", actorId,)
    .executeTakeFirst();
  if (!result || Number(result.numDeletedRows ?? 0,) === 0) {
    return { ok: false, code: "not_found", message: "Lore entry not found", };
  }
  return { ok: true, id: loreId, };
}

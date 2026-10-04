// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Actor Notes Service — typed CRUD over `actor_notes`, scoped to one actor.
 * Ordering and defaults mirror the `actor-notes` entity-routes config
 * (pinned first, then sort order, newest first).
 */
import type { Kysely, Selectable, Updateable, } from "kysely";
import { sql, } from "kysely";
import { NoteCategory, PinnedState, } from "../db/enums";
import type { DB, } from "../db/schema";
import { uid, } from "../utils";
import { requireActorOwnership, } from "./access";
import type {
  ActorDeleteResult,
  ActorListOpts,
  ActorListResult,
  ActorMutationResult,
} from "./types";

/** A single `actor_notes` row. */
export type NoteRow = Selectable<DB["actor_notes"]>;

/** Payload for creating a note. `title` and `content` are required. */
export interface CreateNoteInput {
  title: string;
  content: string;
  category?: NoteCategory;
  pinned?: boolean;
  sortOrder?: number;
}

/** Payload for updating a note; omitted fields are left untouched. */
export type UpdateNoteInput = Partial<CreateNoteInput>;

/** Options narrowing {@link listActorNotes}. */
export interface ListNotesOpts extends ActorListOpts {
  category?: NoteCategory;
}

/**
 * List an actor's notes (pinned first, then sort order, newest first).
 * @param database - Database handle
 * @param actorId - Actor to list notes for
 * @param userId - Authenticated requester id
 * @param userRole - Requester role
 * @param opts - Paging plus an optional category filter
 * @returns Paginated notes or an error
 */
export async function listActorNotes(
  database: Kysely<DB>,
  actorId: string,
  userId: string,
  userRole: string | null | undefined,
  opts: ListNotesOpts = {},
): Promise<ActorListResult<NoteRow>> {
  const denied = await requireActorOwnership(database, actorId, userId, userRole,);
  if (denied) { return denied; }

  const page = Math.max(1, opts.page ?? 1,);
  const pageSize = Math.max(1, opts.pageSize ?? 50,);

  let countQuery = database
    .selectFrom("actor_notes",)
    .select(database.fn.countAll().as("total",),)
    .where("actor_id", "=", actorId,);

  let listQuery = database
    .selectFrom("actor_notes",)
    .selectAll()
    .where("actor_id", "=", actorId,);

  if (opts.category) {
    countQuery = countQuery.where("category", "=", opts.category,);
    listQuery = listQuery.where("category", "=", opts.category,);
  }

  const countResult = await countQuery.executeTakeFirst();
  const items = await listQuery
    // `pinned` is a state string ("unpinned"/"pinned"/"archived") — order by
    // the pinned predicate, not the raw string, so pinned notes sort first.
    .orderBy(sql`pinned = ${PinnedState.Pinned}`, "desc",)
    .orderBy("sort_order", "asc",)
    .orderBy("created_at", "desc",)
    .limit(pageSize,)
    .offset((page - 1) * pageSize,)
    .execute();

  return { ok: true, items, total: Number(countResult?.total ?? 0,), page, pageSize, };
}

/**
 * Create a note for an actor.
 * @param database - Database handle
 * @param actorId - Owning actor
 * @param userId - Authenticated requester id
 * @param userRole - Requester role
 * @param input - Note fields; `title` and `content` are required
 * @returns The created row or an error
 */
export async function createActorNote(
  database: Kysely<DB>,
  actorId: string,
  userId: string,
  userRole: string | null | undefined,
  input: CreateNoteInput,
): Promise<ActorMutationResult<NoteRow>> {
  const denied = await requireActorOwnership(database, actorId, userId, userRole,);
  if (denied) { return denied; }
  for (const required of ["title", "content",] as const) {
    if (input[required] == null || input[required] === "") {
      return { ok: false, code: "bad_request", message: `${required} is required`, };
    }
  }

  const id = uid();
  await database
    .insertInto("actor_notes",)
    .values({
      id,
      actor_id: actorId,
      title: input.title,
      content: input.content,
      category: input.category ?? NoteCategory.General,
      pinned: input.pinned ?? false ? PinnedState.Pinned : PinnedState.Unpinned,
      sort_order: input.sortOrder ?? 0,
    },)
    .execute();

  const entity = await database
    .selectFrom("actor_notes",)
    .selectAll()
    .where("id", "=", id,)
    .executeTakeFirstOrThrow();

  return { ok: true, entity, };
}

/**
 * Update a note in place. The note must belong to the given actor.
 * @param database - Database handle
 * @param actorId - Owning actor
 * @param noteId - Note to update
 * @param userId - Authenticated requester id
 * @param userRole - Requester role
 * @param patch - Fields to change; omitted fields are untouched
 * @returns The updated row or an error
 */
export async function updateActorNote(
  database: Kysely<DB>,
  actorId: string,
  noteId: string,
  userId: string,
  userRole: string | null | undefined,
  patch: UpdateNoteInput,
): Promise<ActorMutationResult<NoteRow>> {
  const denied = await requireActorOwnership(database, actorId, userId, userRole,);
  if (denied) { return denied; }

  const existing = await database
    .selectFrom("actor_notes",)
    .selectAll()
    .where("id", "=", noteId,)
    .where("actor_id", "=", actorId,)
    .executeTakeFirst();

  if (!existing) {
    return { ok: false, code: "not_found", message: "Note not found", };
  }

  const updates: Updateable<DB["actor_notes"]> = {
    updated_at: new Date().toISOString(),
  };

  if (patch.title != null) { updates.title = patch.title; }
  if (patch.content != null) { updates.content = patch.content; }
  if (patch.category != null) { updates.category = patch.category; }
  if (patch.pinned != null) {
    updates.pinned = patch.pinned ? PinnedState.Pinned : PinnedState.Unpinned;
  }

  if (patch.sortOrder != null) { updates.sort_order = patch.sortOrder; }

  if (Object.keys(updates,).length === 1) { return { ok: true, entity: existing, }; }

  await database
    .updateTable("actor_notes",)
    .set(updates,)
    .where("id", "=", noteId,)
    .execute();

  const entity = await database
    .selectFrom("actor_notes",)
    .selectAll()
    .where("id", "=", noteId,)
    .executeTakeFirstOrThrow();

  return { ok: true, entity, };
}

/**
 * Delete a note. The note must belong to the given actor.
 * @param database - Database handle
 * @param actorId - Owning actor
 * @param noteId - Note to delete
 * @param userId - Authenticated requester id
 * @param userRole - Requester role
 * @returns The deleted id or an error
 */
export async function deleteActorNote(
  database: Kysely<DB>,
  actorId: string,
  noteId: string,
  userId: string,
  userRole: string | null | undefined,
): Promise<ActorDeleteResult> {
  const denied = await requireActorOwnership(database, actorId, userId, userRole,);
  if (denied) { return denied; }

  const result = await database
    .deleteFrom("actor_notes",)
    .where("id", "=", noteId,)
    .where("actor_id", "=", actorId,)
    .executeTakeFirst();

  if (!result || Number(result.numDeletedRows ?? 0,) === 0) {
    return { ok: false, code: "not_found", message: "Note not found", };
  }

  return { ok: true, id: noteId, };
}

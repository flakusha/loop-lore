// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Actor Memories Service — typed CRUD over `actor_memories`, scoped to one
 * actor. Field defaults mirror the `actor-memories` entity-routes config;
 * `scope: "world"` writes stay admin-only, matching the route write-guard.
 */
import type { Kysely, Selectable, Updateable, } from "kysely";
import type { ExtractionKind, MemoryReviewStatus, MemoryType, } from "../db/enums";
import { PinnedState, } from "../db/enums";
import type { DB, } from "../db/schema";
import { can, } from "../users/permissions";
import { jsonStringifyOr, uid, } from "../utils";
import { requireActorOwnership, } from "./access";
import type {
  ActorDeleteResult,
  ActorListOpts,
  ActorListResult,
  ActorMutationResult,
} from "./types";

/** A single `actor_memories` row. */
export type MemoryRow = Selectable<DB["actor_memories"]>;

/** Payload for creating a memory. `content` is required. */
export interface CreateMemoryInput {
  content: string;
  memoryType?: MemoryType;
  confidence?: number;
  importance?: number;
  /** JSON-array column; stored as a JSON string. */
  keywords?: string[];
  expiresAt?: string | null;
  context?: string | null;
  pinned?: boolean;
  sourceChatId?: string | null;
  reviewStatus?: MemoryReviewStatus;
  /** `"world"` requires the admin.world permission. */
  scope?: "character" | "world";
  extractionKind?: ExtractionKind;
}

/** Payload for updating a memory; omitted fields are left untouched. */
export type UpdateMemoryInput = Partial<CreateMemoryInput>;

/** Options narrowing {@link listActorMemories}. */
export interface ListMemoriesOpts extends ActorListOpts {
  memoryType?: MemoryType;
}

/**
 * List an actor's memories, most important first (matches the route order).
 * @param database - Database handle
 * @param actorId - Actor to list memories for
 * @param userId - Authenticated requester id
 * @param userRole - Requester role
 * @param opts - Paging plus an optional memory-type filter
 * @returns Paginated memories or an error
 */
export async function listActorMemories(
  database: Kysely<DB>,
  actorId: string,
  userId: string,
  userRole: string | null | undefined,
  opts: ListMemoriesOpts = {},
): Promise<ActorListResult<MemoryRow>> {
  const denied = await requireActorOwnership(database, actorId, userId, userRole,);
  if (denied) { return denied; }

  const page = Math.max(1, opts.page ?? 1,);
  const pageSize = Math.max(1, opts.pageSize ?? 50,);

  let countQuery = database
    .selectFrom("actor_memories",)
    .select(database.fn.countAll().as("total",),)
    .where("actor_id", "=", actorId,);
  let listQuery = database
    .selectFrom("actor_memories",)
    .selectAll()
    .where("actor_id", "=", actorId,);
  if (opts.memoryType) {
    countQuery = countQuery.where("memory_type", "=", opts.memoryType,);
    listQuery = listQuery.where("memory_type", "=", opts.memoryType,);
  }

  const countResult = await countQuery.executeTakeFirst();
  const items = await listQuery
    .orderBy("importance", "desc",)
    .orderBy("created_at", "desc",)
    .limit(pageSize,)
    .offset((page - 1) * pageSize,)
    .execute();

  return { ok: true, items, total: Number(countResult?.total ?? 0,), page, pageSize, };
}

/**
 * Create a memory for an actor.
 * @param database - Database handle
 * @param actorId - Owning actor
 * @param userId - Authenticated requester id
 * @param userRole - Requester role
 * @param input - Memory fields; `content` is required
 * @returns The created row or an error
 */
export async function createActorMemory(
  database: Kysely<DB>,
  actorId: string,
  userId: string,
  userRole: string | null | undefined,
  input: CreateMemoryInput,
): Promise<ActorMutationResult<MemoryRow>> {
  const denied = await requireActorOwnership(database, actorId, userId, userRole,);
  if (denied) { return denied; }
  if (input.content == null || input.content === "") {
    return { ok: false, code: "bad_request", message: "content is required", };
  }
  if (input.scope === "world" && !can(userRole, "admin.world",)) {
    return { ok: false, code: "forbidden", message: "World memories are admin-managed", };
  }

  const id = uid();
  await database
    .insertInto("actor_memories",)
    .values({
      id,
      actor_id: actorId,
      content: input.content,
      memory_type: input.memoryType ?? "episodic",
      confidence: input.confidence ?? 1,
      importance: input.importance ?? 1,
      pinned: input.pinned ?? false
        ? PinnedState.Pinned
        : PinnedState.Unpinned,
      ...(input.keywords != null ? { keywords: jsonStringifyOr(input.keywords,), } : {}),
      ...(input.expiresAt !== undefined ? { expires_at: input.expiresAt, } : {}),
      ...(input.context !== undefined ? { context: input.context, } : {}),
      ...(input.sourceChatId !== undefined ? { source_chat_id: input.sourceChatId, } : {}),
      ...(input.reviewStatus != null ? { review_status: input.reviewStatus, } : {}),
      ...(input.scope != null ? { scope: input.scope, } : {}),
      ...(input.extractionKind != null ? { extraction_kind: input.extractionKind, } : {}),
    },)
    .execute();

  const entity = await database
    .selectFrom("actor_memories",)
    .selectAll()
    .where("id", "=", id,)
    .executeTakeFirstOrThrow();
  return { ok: true, entity, };
}

/**
 * Update a memory in place. The memory must belong to the given actor.
 * @param database - Database handle
 * @param actorId - Owning actor
 * @param memoryId - Memory to update
 * @param userId - Authenticated requester id
 * @param userRole - Requester role
 * @param patch - Fields to change; omitted fields are untouched
 * @returns The updated row or an error
 */
export async function updateActorMemory(
  database: Kysely<DB>,
  actorId: string,
  memoryId: string,
  userId: string,
  userRole: string | null | undefined,
  patch: UpdateMemoryInput,
): Promise<ActorMutationResult<MemoryRow>> {
  const denied = await requireActorOwnership(database, actorId, userId, userRole,);
  if (denied) { return denied; }

  const existing = await database
    .selectFrom("actor_memories",)
    .selectAll()
    .where("id", "=", memoryId,)
    .where("actor_id", "=", actorId,)
    .executeTakeFirst();
  if (!existing) {
    return { ok: false, code: "not_found", message: "Memory not found", };
  }
  if ((patch.scope === "world" || existing.scope === "world") && !can(userRole, "admin.world",)) {
    return { ok: false, code: "forbidden", message: "World memories are admin-managed", };
  }

  const updates: Updateable<DB["actor_memories"]> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.content != null) { updates.content = patch.content; }
  if (patch.memoryType != null) { updates.memory_type = patch.memoryType; }
  if (patch.confidence != null) { updates.confidence = patch.confidence; }
  if (patch.importance != null) { updates.importance = patch.importance; }
  if (patch.keywords != null) { updates.keywords = jsonStringifyOr(patch.keywords,); }
  if (patch.expiresAt !== undefined) { updates.expires_at = patch.expiresAt; }
  if (patch.context !== undefined) { updates.context = patch.context; }
  if (patch.pinned != null) {
    updates.pinned = patch.pinned ? PinnedState.Pinned : PinnedState.Unpinned;
  }
  if (patch.sourceChatId !== undefined) { updates.source_chat_id = patch.sourceChatId; }
  if (patch.reviewStatus != null) { updates.review_status = patch.reviewStatus; }
  if (patch.scope != null) { updates.scope = patch.scope; }
  if (patch.extractionKind != null) { updates.extraction_kind = patch.extractionKind; }

  if (Object.keys(updates,).length === 1) { return { ok: true, entity: existing, }; }

  await database
    .updateTable("actor_memories",)
    .set(updates,)
    .where("id", "=", memoryId,)
    .execute();

  const entity = await database
    .selectFrom("actor_memories",)
    .selectAll()
    .where("id", "=", memoryId,)
    .executeTakeFirstOrThrow();
  return { ok: true, entity, };
}

/**
 * Delete a memory. The memory must belong to the given actor.
 * @param database - Database handle
 * @param actorId - Owning actor
 * @param memoryId - Memory to delete
 * @param userId - Authenticated requester id
 * @param userRole - Requester role
 * @returns The deleted id or an error
 */
export async function deleteActorMemory(
  database: Kysely<DB>,
  actorId: string,
  memoryId: string,
  userId: string,
  userRole: string | null | undefined,
): Promise<ActorDeleteResult> {
  const denied = await requireActorOwnership(database, actorId, userId, userRole,);
  if (denied) { return denied; }

  // World-scoped memories are admin-managed: a non-admin may not delete one
  // (mirrors the route write-guard, which runs against the existing row).
  const existing = await database
    .selectFrom("actor_memories",)
    .select("scope",)
    .where("id", "=", memoryId,)
    .where("actor_id", "=", actorId,)
    .executeTakeFirst();
  if (!existing) {
    return { ok: false, code: "not_found", message: "Memory not found", };
  }
  if (existing.scope === "world" && !can(userRole, "admin.world",)) {
    return { ok: false, code: "forbidden", message: "World memories are admin-managed", };
  }

  await database
    .deleteFrom("actor_memories",)
    .where("id", "=", memoryId,)
    .where("actor_id", "=", actorId,)
    .execute();
  return { ok: true, id: memoryId, };
}

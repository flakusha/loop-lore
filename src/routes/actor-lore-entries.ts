/**
 * Actor Lore Entries Routes
 *
 * CRUD for per-actor lorebook entries (character_book):
 *   GET    /api/actors/:actorId/lore-entries        — list lore entries (paginated)
 *   POST   /api/actors/:actorId/lore-entries        — create lore entry
 *   GET    /api/actors/:actorId/lore-entries/:id    — get single entry
 *   PUT    /api/actors/:actorId/lore-entries/:id    — update entry
 *   DELETE /api/actors/:actorId/lore-entries/:id    — delete entry
 */

import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import type { RouteDispatch } from "./router";
import { registerRoute } from "./router";
import { uid, safeJsonStringify } from "../utils";
import {
  BAD_METHOD,
  jsonResponse,
  jsonError,
  jsonPaginated,
  jsonCreated,
  jsonNoContent,
  HttpStatus,
  ErrorCode,
  parseBody,
  parsePagination,
} from "./http-utils";

function extractIds(pathname: string): { actorId: string | null; entryId: string | null } {
  const match = /^\/api\/actors\/([a-f0-9-]+)\/lore-entries(?:\/([a-f0-9-]+))?$/.exec(pathname);
  return { actorId: match?.[1] ?? null, entryId: match?.[2] ?? null };
}

const dispatch: RouteDispatch = async ({ request, context, database }) => {
  const url = new URL(request.url);
  const { pathname, searchParams } = url;
  const method = request.method;

  const { actorId, entryId } = extractIds(pathname);
  if (!actorId) return null;

  // Ownership check — verify actor belongs to user (or admin)
  const actorOwnership = await database
    .selectFrom("actors")
    .select("user_id")
    .where("id", "=", actorId)
    .executeTakeFirst();
  if (!actorOwnership || (actorOwnership.user_id !== context.userId && context.userRole !== "admin")) {
    return jsonError("Actor not found", HttpStatus.NotFound);
  }

  // /api/actors/:actorId/lore-entries/:entryId
  if (entryId) {
    if (method === "GET") return handleGet({ database, actorId, entryId });
    if (method === "PUT") {
      const body = await parseBody(request);
      if (body instanceof Response) return body;
      return handleUpdate({ database, actorId, entryId, body });
    }
    if (method === "DELETE") return handleDelete({ database, actorId, entryId });
    return BAD_METHOD();
  }

  // /api/actors/:actorId/lore-entries
  if (method === "GET") {
    const { page, pageSize } = parsePagination(searchParams);
    return handleList({ database, actorId, page, pageSize });
  }
  if (method === "POST") {
    const body = await parseBody(request);
    if (body instanceof Response) return body;
    return handleCreate({ database, actorId, body });
  }

  return BAD_METHOD();
};

async function handleList(opts: {
  database: Kysely<DB>;
  actorId: string;
  page: number;
  pageSize: number;
}): Promise<Response> {
  const offset = (opts.page - 1) * opts.pageSize;

  const countResult = await opts.database
    .selectFrom("actor_lore_entries")
    .select(opts.database.fn.countAll<number>().as("total"))
    .where("actor_id", "=", opts.actorId)
    .executeTakeFirst();

  const total = countResult?.total ?? 0;

  const entries = await opts.database
    .selectFrom("actor_lore_entries")
    .selectAll()
    .where("actor_id", "=", opts.actorId)
    .orderBy("sort_order", "asc")
    .orderBy("insertion_order", "asc")
    .limit(opts.pageSize)
    .offset(offset)
    .execute();

  return jsonPaginated(entries, total, opts.page, opts.pageSize);
}

async function handleCreate(opts: {
  database: Kysely<DB>;
  actorId: string;
  body: Record<string, unknown>;
}): Promise<Response> {
  const content = opts.body.content as string | undefined;
  if (!content) return jsonError("content is required", HttpStatus.BadRequest);

  const id = uid();

  await opts.database
    .insertInto("actor_lore_entries")
    .values({
      id,
      actor_id: opts.actorId,
      name: (opts.body.name as string | undefined) ?? null,
      content,
      keys: (() => {
        const r = safeJsonStringify(opts.body.keys ?? []);
        return r.ok ? r.value : "[]";
      })(),
      secondary_keys: (() => {
        const r = safeJsonStringify(opts.body.secondaryKeys ?? []);
        return r.ok ? r.value : "[]";
      })(),
      selective: (opts.body.selective as number | undefined) ?? 0,
      case_sensitive: (opts.body.caseSensitive as number | undefined) ?? 0,
      enabled: (opts.body.enabled as number | undefined) ?? 1,
      constant: (opts.body.constant as number | undefined) ?? 0,
      position: (opts.body.position as string | undefined) ?? "before_char",
      insertion_order: (opts.body.insertionOrder as number | undefined) ?? 100,
      priority: (opts.body.priority as number | undefined) ?? 100,
      comment: (opts.body.comment as string | undefined) ?? null,
      sort_order: (opts.body.sortOrder as number | undefined) ?? 0,
    })
    .execute();

  const created = await opts.database
    .selectFrom("actor_lore_entries")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  return jsonCreated(created);
}

async function handleGet(opts: {
  database: Kysely<DB>;
  actorId: string;
  entryId: string;
}): Promise<Response> {
  const entry = await opts.database
    .selectFrom("actor_lore_entries")
    .selectAll()
    .where("id", "=", opts.entryId)
    .where("actor_id", "=", opts.actorId)
    .executeTakeFirst();

  if (!entry) return jsonError("Lore entry not found", HttpStatus.NotFound, ErrorCode.NotFound);
  return jsonResponse(entry);
}

async function handleUpdate(opts: {
  database: Kysely<DB>;
  actorId: string;
  entryId: string;
  body: Record<string, unknown>;
}): Promise<Response> {
  const existing = await opts.database
    .selectFrom("actor_lore_entries")
    .select("id")
    .where("id", "=", opts.entryId)
    .where("actor_id", "=", opts.actorId)
    .executeTakeFirst();

  if (!existing) return jsonError("Lore entry not found", HttpStatus.NotFound, ErrorCode.NotFound);

  const updates: Record<string, unknown> = {};
  const strFields = ["name", "content", "position", "comment"] as const;
  const intFields = [
    "selective",
    "caseSensitive",
    "enabled",
    "constant",
    "insertionOrder",
    "priority",
    "sortOrder",
  ] as const;
  const intCols: Record<string, string> = {
    selective: "selective",
    caseSensitive: "case_sensitive",
    enabled: "enabled",
    constant: "constant",
    insertionOrder: "insertion_order",
    priority: "priority",
    sortOrder: "sort_order",
  };

  for (const f of strFields) {
    if (opts.body[f] != null) updates[f] = opts.body[f];
  }
  for (const f of intFields) {
    if (opts.body[f] != null) updates[intCols[f]] = opts.body[f];
  }
  if (opts.body.keys != null) {
    const r = safeJsonStringify(opts.body.keys);
    if (r.ok) updates.keys = r.value;
  }
  if (opts.body.secondaryKeys != null) {
    const r = safeJsonStringify(opts.body.secondaryKeys);
    if (r.ok) updates.secondary_keys = r.value;
  }

  updates.updated_at = new Date().toISOString();

  await opts.database.updateTable("actor_lore_entries").set(updates).where("id", "=", opts.entryId).execute();

  const updated = await opts.database
    .selectFrom("actor_lore_entries")
    .selectAll()
    .where("id", "=", opts.entryId)
    .executeTakeFirst();

  return jsonResponse(updated);
}

async function handleDelete(opts: {
  database: Kysely<DB>;
  actorId: string;
  entryId: string;
}): Promise<Response> {
  const result = await opts.database
    .deleteFrom("actor_lore_entries")
    .where("id", "=", opts.entryId)
    .where("actor_id", "=", opts.actorId)
    .execute();

  if (result.length === 0) {
    return jsonError("Lore entry not found", HttpStatus.NotFound, ErrorCode.NotFound);
  }
  return jsonNoContent();
}

registerRoute(dispatch);

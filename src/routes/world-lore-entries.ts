/**
 * World Lore Entries Routes
 *
 * CRUD for per-world lorebook entries:
 *   GET    /api/worlds/:worldId/lore-entries        — list lore entries (paginated)
 *   POST   /api/worlds/:worldId/lore-entries        — create lore entry
 *   GET    /api/worlds/:worldId/lore-entries/:id    — get single entry
 *   PUT    /api/worlds/:worldId/lore-entries/:id    — update entry
 *   DELETE /api/worlds/:worldId/lore-entries/:id    — delete entry
 */

import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import type { RequestContext } from "../middleware/types";
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

function extractIds(pathname: string): { worldId: string | null; entryId: string | null } {
  const match = /^\/api\/worlds\/([a-f0-9-]+)\/lore-entries(?:\/([a-f0-9-]+))?$/.exec(pathname);
  return { worldId: match?.[1] ?? null, entryId: match?.[2] ?? null };
}

const dispatch: RouteDispatch = async ({ request, context, database }) => {
  const url = new URL(request.url);
  const { pathname, searchParams } = url;
  const method = request.method;

  const { worldId, entryId } = extractIds(pathname);
  if (!worldId) return null;

  // /api/worlds/:worldId/lore-entries/:entryId
  if (entryId) {
    if (method === "GET") return handleGet({ database, worldId, entryId, context });
    if (method === "PUT") {
      const body = await parseBody(request);
      if (body instanceof Response) return body;
      return handleUpdate({ database, worldId, entryId, body, context });
    }
    if (method === "DELETE") return handleDelete({ database, worldId, entryId, context });
    return BAD_METHOD();
  }

  // /api/worlds/:worldId/lore-entries
  if (method === "GET") {
    const { page, pageSize } = parsePagination(searchParams);
    return handleList({ database, worldId, page, pageSize, context });
  }
  if (method === "POST") {
    const body = await parseBody(request);
    if (body instanceof Response) return body;
    return handleCreate({ database, worldId, body, context });
  }

  return BAD_METHOD();
};

async function handleList(opts: {
  database: Kysely<DB>;
  worldId: string;
  page: number;
  pageSize: number;
  context: RequestContext;
}): Promise<Response> {
  const { userId, userRole } = opts.context;
  const world = await opts.database
    .selectFrom("worlds")
    .select("owner_id")
    .where("id", "=", opts.worldId)
    .executeTakeFirst();
  if (!world || (world.owner_id !== userId && userRole !== "admin"))
    return jsonError("World not found", HttpStatus.NotFound, ErrorCode.NotFound);

  const offset = (opts.page - 1) * opts.pageSize;

  const countResult = await opts.database
    .selectFrom("world_lore_entries")
    .select(opts.database.fn.countAll<number>().as("total"))
    .where("world_id", "=", opts.worldId)
    .executeTakeFirst();

  const total = countResult?.total ?? 0;

  const entries = await opts.database
    .selectFrom("world_lore_entries")
    .selectAll()
    .where("world_id", "=", opts.worldId)
    .orderBy("sort_order", "asc")
    .orderBy("insertion_order", "asc")
    .limit(opts.pageSize)
    .offset(offset)
    .execute();

  return jsonPaginated(entries, total, opts.page, opts.pageSize);
}

async function handleCreate(opts: {
  database: Kysely<DB>;
  worldId: string;
  body: Record<string, unknown>;
  context: RequestContext;
}): Promise<Response> {
  const { userId, userRole } = opts.context;
  const world = await opts.database
    .selectFrom("worlds")
    .select("owner_id")
    .where("id", "=", opts.worldId)
    .executeTakeFirst();
  if (!world || (world.owner_id !== userId && userRole !== "admin"))
    return jsonError("World not found", HttpStatus.NotFound, ErrorCode.NotFound);

  const content = opts.body.content as string | undefined;
  if (!content) return jsonError("content is required", HttpStatus.BadRequest);

  const id = uid();

  await opts.database
    .insertInto("world_lore_entries")
    .values({
      id,
      world_id: opts.worldId,
      name: (opts.body.name as string) ?? null,
      content,
      keys: (() => {
        const r = safeJsonStringify(opts.body.keys ?? []);
        return r.ok ? r.value : "[]";
      })(),
      secondary_keys: (() => {
        const r = safeJsonStringify(opts.body.secondaryKeys ?? []);
        return r.ok ? r.value : "[]";
      })(),
      selective: (opts.body.selective as number) ?? 0,
      case_sensitive: (opts.body.caseSensitive as number) ?? 0,
      enabled: (opts.body.enabled as number) ?? 1,
      constant: (opts.body.constant as number) ?? 0,
      position: (opts.body.position as string) ?? "before_char",
      insertion_order: (opts.body.insertionOrder as number) ?? 100,
      priority: (opts.body.priority as number) ?? 100,
      comment: (opts.body.comment as string) ?? null,
      sort_order: (opts.body.sortOrder as number) ?? 0,
    })
    .execute();

  const created = await opts.database
    .selectFrom("world_lore_entries")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  return jsonCreated(created);
}

async function handleGet(opts: {
  database: Kysely<DB>;
  worldId: string;
  entryId: string;
  context: RequestContext;
}): Promise<Response> {
  const { userId, userRole } = opts.context;
  const entry = await opts.database
    .selectFrom("world_lore_entries")
    .innerJoin("worlds", "worlds.id", "world_lore_entries.world_id")
    .select(["world_lore_entries.id", "world_lore_entries.world_id", "worlds.owner_id"])
    .where("world_lore_entries.id", "=", opts.entryId)
    .where("world_lore_entries.world_id", "=", opts.worldId)
    .executeTakeFirst();

  if (!entry || (entry.owner_id !== userId && userRole !== "admin"))
    return jsonError("Lore entry not found", HttpStatus.NotFound, ErrorCode.NotFound);

  const fullEntry = await opts.database
    .selectFrom("world_lore_entries")
    .selectAll()
    .where("id", "=", opts.entryId)
    .where("world_id", "=", opts.worldId)
    .executeTakeFirst();

  if (!fullEntry) return jsonError("Lore entry not found", HttpStatus.NotFound, ErrorCode.NotFound);
  return jsonResponse(fullEntry);
}

async function handleUpdate(opts: {
  database: Kysely<DB>;
  worldId: string;
  entryId: string;
  body: Record<string, unknown>;
  context: RequestContext;
}): Promise<Response> {
  const { userId, userRole } = opts.context;
  const existing = await opts.database
    .selectFrom("world_lore_entries")
    .innerJoin("worlds", "worlds.id", "world_lore_entries.world_id")
    .select(["world_lore_entries.id", "worlds.owner_id"])
    .where("world_lore_entries.id", "=", opts.entryId)
    .where("world_lore_entries.world_id", "=", opts.worldId)
    .executeTakeFirst();

  if (!existing || (existing.owner_id !== userId && userRole !== "admin"))
    return jsonError("Lore entry not found", HttpStatus.NotFound, ErrorCode.NotFound);

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

  await opts.database.updateTable("world_lore_entries").set(updates).where("id", "=", opts.entryId).execute();

  const updated = await opts.database
    .selectFrom("world_lore_entries")
    .selectAll()
    .where("id", "=", opts.entryId)
    .executeTakeFirst();

  return jsonResponse(updated);
}

async function handleDelete(opts: {
  database: Kysely<DB>;
  worldId: string;
  entryId: string;
  context: RequestContext;
}): Promise<Response> {
  const { userId, userRole } = opts.context;
  const ownerCheck = await opts.database
    .selectFrom("world_lore_entries")
    .innerJoin("worlds", "worlds.id", "world_lore_entries.world_id")
    .select(["world_lore_entries.id", "worlds.owner_id"])
    .where("world_lore_entries.id", "=", opts.entryId)
    .where("world_lore_entries.world_id", "=", opts.worldId)
    .executeTakeFirst();

  if (!ownerCheck || (ownerCheck.owner_id !== userId && userRole !== "admin")) {
    return jsonError("Lore entry not found", HttpStatus.NotFound, ErrorCode.NotFound);
  }

  await opts.database
    .deleteFrom("world_lore_entries")
    .where("id", "=", opts.entryId)
    .where("world_id", "=", opts.worldId)
    .execute();

  return jsonNoContent();
}

registerRoute(dispatch);

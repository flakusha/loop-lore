/**
 * Actor Items Routes
 *
 * CRUD for per-actor inventory items:
 *   GET    /api/actors/:actorId/items       — list items (paginated)
 *   POST   /api/actors/:actorId/items       — create item
 *   GET    /api/actors/:actorId/items/:id   — get single item
 *   PUT    /api/actors/:actorId/items/:id   — update item
 *   DELETE /api/actors/:actorId/items/:id   — delete item
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

function extractIds(pathname: string): { actorId: string | null; itemId: string | null } {
  const match = /^\/api\/actors\/([a-f0-9-]+)\/items(?:\/([a-f0-9-]+))?$/.exec(pathname);
  return { actorId: match?.[1] ?? null, itemId: match?.[2] ?? null };
}

const dispatch: RouteDispatch = async ({ request, context, database }) => {
  const url = new URL(request.url);
  const { pathname, searchParams } = url;
  const method = request.method;

  const { actorId, itemId } = extractIds(pathname);
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

  // /api/actors/:actorId/items/:itemId
  if (itemId) {
    if (method === "GET") return handleGet({ database, actorId, itemId });
    if (method === "PUT") {
      const body = await parseBody(request);
      if (body instanceof Response) return body;
      return handleUpdate({ database, actorId, itemId, body });
    }
    if (method === "DELETE") return handleDelete({ database, actorId, itemId });
    return BAD_METHOD();
  }

  // /api/actors/:actorId/items
  if (method === "GET") {
    const { page, pageSize } = parsePagination(searchParams);
    const itemType = searchParams.get("type") ?? undefined;
    return handleList({ database, actorId, page, pageSize, itemType });
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
  itemType?: string;
}): Promise<Response> {
  const offset = (opts.page - 1) * opts.pageSize;

  let countQuery = opts.database
    .selectFrom("actor_items")
    .select(opts.database.fn.countAll<number>().as("total"))
    .where("actor_id", "=", opts.actorId);
  let listQuery = opts.database.selectFrom("actor_items").selectAll().where("actor_id", "=", opts.actorId);

  if (opts.itemType) {
    countQuery = countQuery.where("item_type", "=", opts.itemType);
    listQuery = listQuery.where("item_type", "=", opts.itemType);
  }

  const countResult = await countQuery.executeTakeFirst();
  const total = countResult?.total ?? 0;

  const items = await listQuery
    .orderBy("sort_order", "asc")
    .orderBy("created_at", "desc")
    .limit(opts.pageSize)
    .offset(offset)
    .execute();

  return jsonPaginated(items, total, opts.page, opts.pageSize);
}

async function handleCreate(opts: {
  database: Kysely<DB>;
  actorId: string;
  body: Record<string, unknown>;
}): Promise<Response> {
  const name = opts.body.name as string | undefined;
  if (!name) return jsonError("name is required", HttpStatus.BadRequest);

  const id = uid();

  await opts.database
    .insertInto("actor_items")
    .values({
      id,
      actor_id: opts.actorId,
      name,
      description: (opts.body.description as string | undefined) ?? null,
      item_type: (opts.body.itemType as string | undefined) ?? "misc",
      quantity: (opts.body.quantity as number | undefined) ?? 1,
      value: (opts.body.value as string | undefined) ?? null,
      weight: (opts.body.weight as number | undefined) ?? null,
      tags: (() => {
        const r = safeJsonStringify(opts.body.tags ?? []);
        return r.ok ? r.value : "[]";
      })(),
      metadata: (() => {
        const r = safeJsonStringify(opts.body.metadata ?? {});
        return r.ok ? r.value : "{}";
      })(),
      equipped: (opts.body.equipped as number | undefined) ?? 0,
      sort_order: (opts.body.sortOrder as number | undefined) ?? 0,
    })
    .execute();

  const created = await opts.database
    .selectFrom("actor_items")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  return jsonCreated(created);
}

async function handleGet(opts: { database: Kysely<DB>; actorId: string; itemId: string }): Promise<Response> {
  const item = await opts.database
    .selectFrom("actor_items")
    .selectAll()
    .where("id", "=", opts.itemId)
    .where("actor_id", "=", opts.actorId)
    .executeTakeFirst();

  if (!item) return jsonError("Item not found", HttpStatus.NotFound, ErrorCode.NotFound);
  return jsonResponse(item);
}

async function handleUpdate(opts: {
  database: Kysely<DB>;
  actorId: string;
  itemId: string;
  body: Record<string, unknown>;
}): Promise<Response> {
  const existing = await opts.database
    .selectFrom("actor_items")
    .select("id")
    .where("id", "=", opts.itemId)
    .where("actor_id", "=", opts.actorId)
    .executeTakeFirst();

  if (!existing) return jsonError("Item not found", HttpStatus.NotFound, ErrorCode.NotFound);

  const updates: Record<string, unknown> = {};
  if (opts.body.name != null) updates.name = opts.body.name;
  if (opts.body.description != null) updates.description = opts.body.description;
  if (opts.body.itemType != null) updates.item_type = opts.body.itemType;
  if (opts.body.quantity != null) updates.quantity = opts.body.quantity;
  if (opts.body.value != null) updates.value = opts.body.value;
  if (opts.body.weight != null) updates.weight = opts.body.weight;
  if (opts.body.equipped != null) updates.equipped = opts.body.equipped;
  if (opts.body.sortOrder != null) updates.sort_order = opts.body.sortOrder;
  if (opts.body.tags != null) {
    const r = safeJsonStringify(opts.body.tags);
    if (r.ok) updates.tags = r.value;
  }
  if (opts.body.metadata != null) {
    const r = safeJsonStringify(opts.body.metadata);
    if (r.ok) updates.metadata = r.value;
  }
  updates.updated_at = new Date().toISOString();

  await opts.database.updateTable("actor_items").set(updates).where("id", "=", opts.itemId).execute();

  const updated = await opts.database
    .selectFrom("actor_items")
    .selectAll()
    .where("id", "=", opts.itemId)
    .executeTakeFirst();

  return jsonResponse(updated);
}

async function handleDelete(opts: {
  database: Kysely<DB>;
  actorId: string;
  itemId: string;
}): Promise<Response> {
  const result = await opts.database
    .deleteFrom("actor_items")
    .where("id", "=", opts.itemId)
    .where("actor_id", "=", opts.actorId)
    .execute();

  if (result.length === 0) {
    return jsonError("Item not found", HttpStatus.NotFound, ErrorCode.NotFound);
  }
  return jsonNoContent();
}

registerRoute(dispatch);

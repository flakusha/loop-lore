/**
 * Actor Memories Routes
 *
 * CRUD for memories stored per actor:
 *   GET    /api/actors/:actorId/memories       — list memories (paginated)
 *   POST   /api/actors/:actorId/memories       — create memory
 *   GET    /api/actors/:actorId/memories/:id   — get single memory
 *   PUT    /api/actors/:actorId/memories/:id   — update memory
 *   DELETE /api/actors/:actorId/memories/:id   — delete memory
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

function extractIds(pathname: string): { actorId: string | null; memoryId: string | null } {
  const match = /^\/api\/actors\/([a-f0-9-]+)\/memories(?:\/([a-f0-9-]+))?$/.exec(pathname);
  return { actorId: match?.[1] ?? null, memoryId: match?.[2] ?? null };
}

const dispatch: RouteDispatch = async ({ request, context, database }) => {
  const url = new URL(request.url);
  const { pathname, searchParams } = url;
  const method = request.method;

  const { actorId, memoryId } = extractIds(pathname);
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

  // /api/actors/:actorId/memories/:memoryId
  if (memoryId) {
    if (method === "GET") return handleGet({ database, actorId, memoryId });
    if (method === "PUT") {
      const body = await parseBody(request);
      if (body instanceof Response) return body;
      return handleUpdate({ database, actorId, memoryId, body });
    }
    if (method === "DELETE") return handleDelete({ database, actorId, memoryId });
    return BAD_METHOD();
  }

  // /api/actors/:actorId/memories
  if (method === "GET") {
    const { page, pageSize } = parsePagination(searchParams);
    const memoryType = searchParams.get("type") ?? undefined;
    return handleList({ database, actorId, page, pageSize, memoryType });
  }
  if (method === "POST") {
    const body = await parseBody(request);
    if (body instanceof Response) return body;
    return handleCreate({ database, actorId, body, userId: context.userId });
  }

  return BAD_METHOD();
};

async function handleList(opts: {
  database: Kysely<DB>;
  actorId: string;
  page: number;
  pageSize: number;
  memoryType?: string;
}): Promise<Response> {
  const offset = (opts.page - 1) * opts.pageSize;

  let countQuery = opts.database
    .selectFrom("actor_memories")
    .select(opts.database.fn.countAll<number>().as("total"))
    .where("actor_id", "=", opts.actorId);
  let listQuery = opts.database.selectFrom("actor_memories").selectAll().where("actor_id", "=", opts.actorId);

  if (opts.memoryType) {
    countQuery = countQuery.where("memory_type", "=", opts.memoryType);
    listQuery = listQuery.where("memory_type", "=", opts.memoryType);
  }

  const countResult = await countQuery.executeTakeFirst();
  const total = countResult?.total ?? 0;

  const memories = await listQuery
    .orderBy("importance", "desc")
    .orderBy("created_at", "desc")
    .limit(opts.pageSize)
    .offset(offset)
    .execute();

  return jsonPaginated(memories, total, opts.page, opts.pageSize);
}

async function handleCreate(opts: {
  database: Kysely<DB>;
  actorId: string;
  body: Record<string, unknown>;
  userId: string | null;
}): Promise<Response> {
  const content = opts.body.content as string | undefined;
  if (!content) return jsonError("content is required", HttpStatus.BadRequest);

  const id = uid();
  const memoryType = (opts.body.memoryType as string | undefined) ?? "fact";
  const keywords = (opts.body.keywords as string[] | undefined) ?? [];

  await opts.database
    .insertInto("actor_memories")
    .values({
      id,
      actor_id: opts.actorId,
      source_chat_id: (opts.body.sourceChatId as string | undefined) ?? null,
      content,
      memory_type: memoryType,
      confidence: (opts.body.confidence as number | undefined) ?? 1,
      importance: (opts.body.importance as number | undefined) ?? 1,
      keywords: (() => {
        const r = safeJsonStringify(keywords);
        return r.ok ? r.value : "[]";
      })(),
      expires_at: (opts.body.expiresAt as string | undefined) ?? null,
    })
    .execute();

  const created = await opts.database
    .selectFrom("actor_memories")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  return jsonCreated(created);
}

async function handleGet(opts: {
  database: Kysely<DB>;
  actorId: string;
  memoryId: string;
}): Promise<Response> {
  const memory = await opts.database
    .selectFrom("actor_memories")
    .selectAll()
    .where("id", "=", opts.memoryId)
    .where("actor_id", "=", opts.actorId)
    .executeTakeFirst();

  if (!memory) return jsonError("Memory not found", HttpStatus.NotFound, ErrorCode.NotFound);
  return jsonResponse(memory);
}

async function handleUpdate(opts: {
  database: Kysely<DB>;
  actorId: string;
  memoryId: string;
  body: Record<string, unknown>;
}): Promise<Response> {
  const existing = await opts.database
    .selectFrom("actor_memories")
    .select("id")
    .where("id", "=", opts.memoryId)
    .where("actor_id", "=", opts.actorId)
    .executeTakeFirst();

  if (!existing) return jsonError("Memory not found", HttpStatus.NotFound, ErrorCode.NotFound);

  const updates: Record<string, unknown> = {};
  if (opts.body.content != null) updates.content = opts.body.content;
  if (opts.body.memoryType != null) updates.memory_type = opts.body.memoryType;
  if (opts.body.confidence != null) updates.confidence = opts.body.confidence;
  if (opts.body.importance != null) updates.importance = opts.body.importance;
  if (opts.body.keywords != null) {
    const kw = safeJsonStringify(opts.body.keywords);
    if (kw.ok) updates.keywords = kw.value;
  }
  if (opts.body.expiresAt != null) updates.expires_at = opts.body.expiresAt;
  updates.updated_at = new Date().toISOString();

  await opts.database.updateTable("actor_memories").set(updates).where("id", "=", opts.memoryId).execute();

  const updated = await opts.database
    .selectFrom("actor_memories")
    .selectAll()
    .where("id", "=", opts.memoryId)
    .executeTakeFirst();

  return jsonResponse(updated);
}

async function handleDelete(opts: {
  database: Kysely<DB>;
  actorId: string;
  memoryId: string;
}): Promise<Response> {
  const result = await opts.database
    .deleteFrom("actor_memories")
    .where("id", "=", opts.memoryId)
    .where("actor_id", "=", opts.actorId)
    .execute();

  if (result.length === 0) {
    return jsonError("Memory not found", HttpStatus.NotFound, ErrorCode.NotFound);
  }
  return jsonNoContent();
}

registerRoute(dispatch);

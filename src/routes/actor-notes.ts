/**
 * Actor Notes Routes
 *
 * CRUD for per-actor reference notes:
 *   GET    /api/actors/:actorId/notes       — list notes (paginated)
 *   POST   /api/actors/:actorId/notes       — create note
 *   GET    /api/actors/:actorId/notes/:id   — get single note
 *   PUT    /api/actors/:actorId/notes/:id   — update note
 *   DELETE /api/actors/:actorId/notes/:id   — delete note
 */

import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import type { RequestContext } from "../middleware/types";
import type { RouteDispatch } from "./router";
import { registerRoute } from "./router";
import { uid } from "../utils";
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

function extractIds(pathname: string): { actorId: string | null; noteId: string | null } {
  const match = /^\/api\/actors\/([a-f0-9-]+)\/notes(?:\/([a-f0-9-]+))?$/.exec(pathname);
  return { actorId: match?.[1] ?? null, noteId: match?.[2] ?? null };
}

const dispatch: RouteDispatch = async ({ request, context, database }) => {
  const url = new URL(request.url);
  const { pathname, searchParams } = url;
  const method = request.method;

  const { actorId, noteId } = extractIds(pathname);
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

  // /api/actors/:actorId/notes/:noteId
  if (noteId) {
    if (method === "GET") return handleGet({ database, actorId, noteId });
    if (method === "PUT") {
      const body = await parseBody(request);
      if (body instanceof Response) return body;
      return handleUpdate({ database, actorId, noteId, body });
    }
    if (method === "DELETE") return handleDelete({ database, actorId, noteId });
    return BAD_METHOD();
  }

  // /api/actors/:actorId/notes
  if (method === "GET") {
    const { page, pageSize } = parsePagination(searchParams);
    const category = searchParams.get("category") ?? undefined;
    return handleList({ database, actorId, page, pageSize, category });
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
  category?: string;
}): Promise<Response> {
  const offset = (opts.page - 1) * opts.pageSize;

  let countQuery = opts.database
    .selectFrom("actor_notes")
    .select(opts.database.fn.countAll<number>().as("total"))
    .where("actor_id", "=", opts.actorId);
  let listQuery = opts.database.selectFrom("actor_notes").selectAll().where("actor_id", "=", opts.actorId);

  if (opts.category) {
    countQuery = countQuery.where("category", "=", opts.category);
    listQuery = listQuery.where("category", "=", opts.category);
  }

  const countResult = await countQuery.executeTakeFirst();
  const total = countResult?.total ?? 0;

  const notes = await listQuery
    .orderBy("pinned", "desc")
    .orderBy("sort_order", "asc")
    .orderBy("created_at", "desc")
    .limit(opts.pageSize)
    .offset(offset)
    .execute();

  return jsonPaginated(notes, total, opts.page, opts.pageSize);
}

async function handleCreate(opts: {
  database: Kysely<DB>;
  actorId: string;
  body: Record<string, unknown>;
}): Promise<Response> {
  const title = opts.body.title as string | undefined;
  const content = opts.body.content as string | undefined;
  if (!title) return jsonError("title is required", HttpStatus.BadRequest);
  if (!content) return jsonError("content is required", HttpStatus.BadRequest);

  const id = uid();

  await opts.database
    .insertInto("actor_notes")
    .values({
      id,
      actor_id: opts.actorId,
      title,
      content,
      category: (opts.body.category as string) ?? "general",
      pinned: (opts.body.pinned as number) ?? 0,
      sort_order: (opts.body.sortOrder as number) ?? 0,
    })
    .execute();

  const created = await opts.database
    .selectFrom("actor_notes")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  return jsonCreated(created);
}

async function handleGet(opts: { database: Kysely<DB>; actorId: string; noteId: string }): Promise<Response> {
  const note = await opts.database
    .selectFrom("actor_notes")
    .selectAll()
    .where("id", "=", opts.noteId)
    .where("actor_id", "=", opts.actorId)
    .executeTakeFirst();

  if (!note) return jsonError("Note not found", HttpStatus.NotFound, ErrorCode.NotFound);
  return jsonResponse(note);
}

async function handleUpdate(opts: {
  database: Kysely<DB>;
  actorId: string;
  noteId: string;
  body: Record<string, unknown>;
}): Promise<Response> {
  const existing = await opts.database
    .selectFrom("actor_notes")
    .select("id")
    .where("id", "=", opts.noteId)
    .where("actor_id", "=", opts.actorId)
    .executeTakeFirst();

  if (!existing) return jsonError("Note not found", HttpStatus.NotFound, ErrorCode.NotFound);

  const updates: Record<string, unknown> = {};
  if (opts.body.title != null) updates.title = opts.body.title;
  if (opts.body.content != null) updates.content = opts.body.content;
  if (opts.body.category != null) updates.category = opts.body.category;
  if (opts.body.pinned != null) updates.pinned = opts.body.pinned;
  if (opts.body.sortOrder != null) updates.sort_order = opts.body.sortOrder;
  updates.updated_at = new Date().toISOString();

  await opts.database.updateTable("actor_notes").set(updates).where("id", "=", opts.noteId).execute();

  const updated = await opts.database
    .selectFrom("actor_notes")
    .selectAll()
    .where("id", "=", opts.noteId)
    .executeTakeFirst();

  return jsonResponse(updated);
}

async function handleDelete(opts: {
  database: Kysely<DB>;
  actorId: string;
  noteId: string;
}): Promise<Response> {
  const result = await opts.database
    .deleteFrom("actor_notes")
    .where("id", "=", opts.noteId)
    .where("actor_id", "=", opts.actorId)
    .execute();

  if (result.length === 0) {
    return jsonError("Note not found", HttpStatus.NotFound, ErrorCode.NotFound);
  }
  return jsonNoContent();
}

registerRoute(dispatch);

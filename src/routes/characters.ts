/**
 * Character / Actor Routes
 *
 * CRUD for actors (the unified participant model):
 *   GET    /api/actors               — list actors (paginated, filterable by type)
 *   POST   /api/actors               — create actor
 *   GET    /api/actors/:id           — get single actor
 *   PUT    /api/actors/:id           — update actor
 *   DELETE /api/actors/:id           — delete actor
 *   GET    /api/actors/:id/card      — export character card (V2 JSON)
 *   POST   /api/actors/import        — import character card
 */

import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import type { RequestContext } from "../middleware/types";
import type { RouteDispatch } from "./router";
import { registerRoute } from "./router";
import { uid, safeJsonStringify, jsonParseOr } from "../utils";
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
  extractIdFromPath,
  parsePagination,
} from "./http-utils";
import { ActorType, AgentType } from "../db/enums";

interface ListActorsOpts {
  database: Kysely<DB>;
  page: number;
  pageSize: number;
  type?: string;
  context: RequestContext;
}
interface CreateActorOpts {
  database: Kysely<DB>;
  body: Record<string, unknown>;
  context: RequestContext;
}
interface GetActorOpts {
  database: Kysely<DB>;
  actorId: string;
  context: RequestContext;
}
interface UpdateActorOpts {
  database: Kysely<DB>;
  actorId: string;
  body: Record<string, unknown>;
  context: RequestContext;
}
interface DeleteActorOpts {
  database: Kysely<DB>;
  actorId: string;
  context: RequestContext;
}
interface ExportCardOpts {
  database: Kysely<DB>;
  actorId: string;
  context: RequestContext;
}
interface ImportActorJsonOpts {
  body: Record<string, unknown>;
  database: Kysely<DB>;
  context: RequestContext;
}

const dispatch: RouteDispatch = async ({ request, context, database }) => {
  const url = new URL(request.url);
  const { pathname, searchParams } = url;
  const method = request.method;

  // ── Sub-routes on single actor ──────────────────────────────
  const actorId = extractIdFromPath(pathname, "/api/actors");
  if (actorId) {
    // Check for sub-resources handled by other routes (memories, items, notes, lore-entries)
    const afterId = pathname.slice(pathname.indexOf(actorId) + actorId.length);
    const knownSubResources = ["/memories", "/items", "/notes", "/lore-entries"];
    const isSubResource = knownSubResources.some((s) => afterId.startsWith(s));

    if (isSubResource) return null;

    const subRoute = pathname.endsWith("/card") ? "/card" : "";

    if (method === "GET" && !subRoute) {
      return handleGetActor({ database, actorId, context });
    }
    if (method === "GET" && subRoute === "/card") {
      return handleExportCard({ database, actorId, context });
    }
    if (method === "PUT" && !subRoute) {
      const body = await parseBody(request);
      if (body instanceof Response) return body;
      return handleUpdateActor({ database, actorId, body, context });
    }
    if (method === "DELETE" && !subRoute) {
      return handleDeleteActor({ database, actorId, context });
    }
    return BAD_METHOD();
  }

  // ── Special: /api/actors/import ────────────────────────────
  if (pathname === "/api/actors/import" && method === "POST") {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      return handleImportActorFile({ request, database, context });
    }
    const body = await parseBody(request);
    if (body instanceof Response) return body;
    return handleImportActorJson({ body, database, context });
  }

  // ── /api/actors (collection) ────────────────────────────────
  if (pathname === "/api/actors" && method === "GET") {
    const { page, pageSize } = parsePagination(searchParams);
    const type = searchParams.get("type") ?? undefined;
    return handleListActors({ database, page, pageSize, type, context });
  }

  if (pathname === "/api/actors" && method === "POST") {
    const body = await parseBody(request);
    if (body instanceof Response) return body;
    return handleCreateActor({ database, body, context });
  }

  return null; // Not an actor route
};

async function handleListActors({
  database,
  page,
  pageSize,
  type,
  context,
}: ListActorsOpts): Promise<Response> {
  const userId = context.userId;
  const offset = (page - 1) * pageSize;

  let countQuery = database.selectFrom("actors").select(database.fn.countAll<number>().as("total"));
  let listQuery = database.selectFrom("actors").selectAll();

  if (type) {
    countQuery = countQuery.where("actor_type", "=", type as ActorType);
    listQuery = listQuery.where("actor_type", "=", type as ActorType);
  }

  // Show user's own actors + public (no owner) actors
  if (userId) {
    countQuery = countQuery.where((eb) => eb("owner_id", "=", userId).or("owner_id", "is", null));
    listQuery = listQuery.where((eb) => eb("owner_id", "=", userId).or("owner_id", "is", null));
  }

  const countResult = await countQuery.executeTakeFirst();
  const total = countResult?.total ?? 0;

  const actors = await listQuery.orderBy("display_name", "asc").limit(pageSize).offset(offset).execute();

  return jsonPaginated({ data: actors, total, page, pageSize });
}

async function handleCreateActor({ database, body, context }: CreateActorOpts): Promise<Response> {
  const userId = context.userId;
  if (!userId)
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });

  const displayName = body.displayName as string | undefined;
  if (!displayName) return jsonError({ message: "displayName is required", status: HttpStatus.BadRequest });

  const id = uid();
  await database
    .insertInto("actors")
    .values({
      id,
      actor_type: (body.actorType as ActorType | undefined) ?? ActorType.Character,
      display_name: displayName,
      user_id: userId,
      owner_id: userId,
      agent_type: (body.agentType as AgentType | undefined) ?? AgentType.Ai,
      description: (body.description as string | undefined) ?? null,
      system_prompt: (body.systemPrompt as string | undefined) ?? null,
      settings: "{}",
      import_spec: "raw",
      data_version: 0,
    })
    .execute();

  return jsonCreated({ id });
}

async function handleGetActor({ database, actorId, context }: GetActorOpts): Promise<Response> {
  const actor = await database.selectFrom("actors").selectAll().where("id", "=", actorId).executeTakeFirst();
  if (!actor)
    return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });
  if (actor.visibility !== "public" && actor.user_id !== context.userId && context.userRole !== "admin") {
    return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });
  }
  return jsonResponse(actor);
}

async function handleUpdateActor({ database, actorId, body, context }: UpdateActorOpts): Promise<Response> {
  const userId = context.userId;
  if (!userId)
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });

  const actor = await database.selectFrom("actors").selectAll().where("id", "=", actorId).executeTakeFirst();
  if (!actor)
    return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });
  if (actor.owner_id !== userId && context.userRole !== "admin") {
    return jsonError({ message: "Forbidden", status: HttpStatus.Forbidden, code: ErrorCode.Forbidden });
  }

  const updates: Record<string, unknown> = {};
  if (body.displayName) updates.display_name = body.displayName;
  if (body.description) updates.description = body.description;
  if (body.systemPrompt) updates.system_prompt = body.systemPrompt;
  if (body.avatarAssetId !== undefined) updates.avatar_asset_id = body.avatarAssetId;
  if (body.settings) {
    const settingsResult = safeJsonStringify(body.settings);
    if (!settingsResult.ok)
      return jsonError({ message: "Invalid settings data", status: HttpStatus.BadRequest });
    updates.settings = settingsResult.value;
  }
  updates.updated_at = new Date().toISOString();

  await database.updateTable("actors").set(updates).where("id", "=", actorId).execute();

  return jsonResponse({ ok: true });
}

async function handleDeleteActor({ database, actorId, context }: DeleteActorOpts): Promise<Response> {
  const userId = context.userId;
  if (!userId)
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });

  const actor = await database.selectFrom("actors").selectAll().where("id", "=", actorId).executeTakeFirst();
  if (!actor)
    return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });
  if (actor.owner_id !== userId && context.userRole !== "admin") {
    return jsonError({ message: "Forbidden", status: HttpStatus.Forbidden, code: ErrorCode.Forbidden });
  }

  await database.deleteFrom("actors").where("id", "=", actorId).execute();

  return jsonNoContent();
}

async function handleExportCard({ database, actorId, context }: ExportCardOpts): Promise<Response> {
  const actor = await database.selectFrom("actors").selectAll().where("id", "=", actorId).executeTakeFirst();
  if (!actor)
    return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });
  if (actor.visibility !== "public" && actor.user_id !== context.userId && context.userRole !== "admin") {
    return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });
  }

  // Build V2 character card JSON
  const card = {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: actor.display_name,
      description: actor.description ?? "",
      personality: actor.personality ?? "",
      scenario: actor.scenario ?? "",
      first_mes: actor.welcome_message ?? "",
      mes_example: actor.mes_example ?? "",
      system_prompt: actor.system_prompt ?? "",
      post_history_instructions: actor.post_history_instructions ?? "",
      alternate_greetings: actor.alternate_greetings ? jsonParseOr(actor.alternate_greetings, []) : [],
      creator_notes: actor.creator_notes ?? "",
      creator: actor.creator ?? "",
      character_version: actor.character_version ?? "",
      tags: [],
      extensions: {},
    },
  };

  return jsonResponse(card);
}

function handleImportActorFile(_opts: ImportActorFileOpts): Response {
  return jsonError({
    message: "File import not yet implemented",
    status: HttpStatus.NotImplemented,
    code: ErrorCode.NotImplemented,
  });
}

interface ImportActorFileOpts {
  request: Request;
  database: Kysely<DB>;
  context: RequestContext;
}

async function handleImportActorJson({ body, database, context }: ImportActorJsonOpts): Promise<Response> {
  const userId = context.userId;
  if (!userId)
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });

  // Handle both raw actor data and V2 character card format
  const data = (body.data ?? body) as Record<string, unknown>;
  const displayName = (data.name ?? data.displayName ?? data.display_name) as string | undefined;
  if (!displayName) return jsonError({ message: "Actor name is required", status: HttpStatus.BadRequest });

  const id = uid();
  await database
    .insertInto("actors")
    .values({
      id,
      actor_type: "character",
      display_name: displayName,
      user_id: userId,
      owner_id: userId,
      agent_type: "ai",
      description: (data.description as string | undefined) ?? null,
      system_prompt: (data.system_prompt as string | undefined) ?? null,
      welcome_message: (data.first_mes as string | undefined) ?? null,
      personality: (data.personality as string | undefined) ?? null,
      scenario: (data.scenario as string | undefined) ?? null,
      mes_example: (data.mes_example as string | undefined) ?? null,
      post_history_instructions: (data.post_history_instructions as string | undefined) ?? null,
      creator_notes: (data.creator_notes as string | undefined) ?? null,
      creator: (data.creator as string | undefined) ?? null,
      character_version: (data.character_version as string | undefined) ?? null,
      import_spec: body.spec === "chara_card_v2" ? "chara_card_v2" : "raw",
      alternate_greetings: data.alternate_greetings
        ? (() => {
            const r = safeJsonStringify(data.alternate_greetings);
            return r.ok ? r.value : null;
          })()
        : null,
      settings: "{}",
      data_version: 1,
    })
    .execute();

  return jsonCreated({ id });
}

registerRoute(dispatch);
export { dispatch };

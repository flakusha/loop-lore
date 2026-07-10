/**
 * Chat Routes
 *
 * CRUD for chats:
 *   GET    /api/chats              — list user's chats (paginated)
 *   POST   /api/chats              — create chat
 *   GET    /api/chats/:id          — get single chat
 *   PUT    /api/chats/:id          — update chat
 *   DELETE /api/chats/:id          — delete chat
 *   GET    /api/chats/:id/participants     — list participants
 *   POST   /api/chats/:id/participants     — add participant
 *   DELETE /api/chats/:id/participants/:actorId  — remove participant
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
  extractIdFromPath,
  parsePagination,
} from "./http-utils";
import {
  ChatType,
  ChatMode,
  ChatParticipantRole,
  TurnStrategy,
  MessageRole,
  MessageContentType,
  MessageContentFormat,
  ContentEncoding,
} from "../db/enums";
import { getRuntimeConfig } from "../age-gate/controller";
import { getStatus } from "../age-gate/service";
import { getLogger } from "../logger";

interface ListChatsOpts {
  database: Kysely<DB>;
  context: RequestContext;
  page: number;
  pageSize: number;
}
interface CreateChatOpts {
  database: Kysely<DB>;
  context: RequestContext;
  body: Record<string, unknown>;
}
interface GetChatOpts {
  database: Kysely<DB>;
  context: RequestContext;
  chatId: string;
}
interface UpdateChatOpts {
  database: Kysely<DB>;
  context: RequestContext;
  chatId: string;
  body: Record<string, unknown>;
}
interface DeleteChatOpts {
  database: Kysely<DB>;
  context: RequestContext;
  chatId: string;
}
interface ListParticipantsOpts {
  database: Kysely<DB>;
  context: RequestContext;
  chatId: string;
}
interface AddParticipantOpts {
  database: Kysely<DB>;
  context: RequestContext;
  chatId: string;
  body: Record<string, unknown>;
}
interface RemoveParticipantOpts {
  database: Kysely<DB>;
  context: RequestContext;
  chatId: string;
  actorId: string;
}

const dispatch: RouteDispatch = async ({ request, context, database }) => {
  const url = new URL(request.url);
  const { pathname, searchParams } = url;
  const method = request.method;

  // ── Chat participants sub-routes ────────────────────────────
  const participantMatch = /^\/api\/chats\/([a-f0-9-]+)\/participants(?:\/([a-f0-9-]+))?$/.exec(pathname);
  if (participantMatch) {
    const chatId = participantMatch[1];
    const actorId = participantMatch[2] ?? null;

    if (method === "GET" && !actorId) {
      return handleListParticipants({ database, chatId, context });
    }
    if (method === "POST" && !actorId) {
      const body = await parseBody(request);
      if (body instanceof Response) return body;
      return handleAddParticipant({ database, chatId, body, context });
    }
    if (method === "DELETE" && actorId) {
      return handleRemoveParticipant({ database, chatId, actorId, context });
    }
    return BAD_METHOD();
  }

  // ── /api/chats/:id (skip if sub-route like /messages) ─────
  const chatId = extractIdFromPath(pathname, "/api/chats");
  if (
    chatId &&
    !pathname.includes("/participants") &&
    !pathname.includes("/messages") &&
    !pathname.includes("/story-turns")
  ) {
    if (method === "GET") {
      return handleGetChat({ database, chatId, context });
    }
    if (method === "PUT") {
      const body = await parseBody(request);
      if (body instanceof Response) return body;
      return handleUpdateChat({ database, chatId, body, context });
    }
    if (method === "DELETE") {
      return handleDeleteChat({ database, chatId, context });
    }
    return BAD_METHOD();
  }

  // ── /api/chats (collection) ─────────────────────────────────
  if (pathname === "/api/chats" && method === "GET") {
    const { page, pageSize } = parsePagination(searchParams);
    return handleListChats({ database, context, page, pageSize });
  }

  if (pathname === "/api/chats" && method === "POST") {
    const body = await parseBody(request);
    if (body instanceof Response) return body;
    return handleCreateChat({ database, body, context });
  }

  return null; // Not a chat route
};

async function handleListChats({ database, context, page, pageSize }: ListChatsOpts): Promise<Response> {
  const userId = context.userId;
  if (!userId)
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });

  const offset = (page - 1) * pageSize;
  const countResult = await database
    .selectFrom("chats")
    .select(database.fn.countAll<number>().as("total"))
    .where("created_by", "=", userId)
    .executeTakeFirst();
  const total = countResult?.total ?? 0;

  const chats = await database
    .selectFrom("chats")
    .selectAll()
    .where("created_by", "=", userId)
    .orderBy("updated_at", "desc")
    .limit(pageSize)
    .offset(offset)
    .execute();

  return jsonPaginated({ data: chats, total, page, pageSize });
}

async function handleCreateChat({ database, body, context }: CreateChatOpts): Promise<Response> {
  const userId = context.userId;
  if (!userId)
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });

  // ── Age gate check ─────────────────────────────────────
  const ageGateConfig = getRuntimeConfig();
  if (ageGateConfig.enabled && ageGateConfig.mode !== "none") {
    const user = await database
      .selectFrom("users")
      .select(["birth_date", "age_gate_accepted_at"])
      .where("id", "=", userId)
      .executeTakeFirst();
    const status = getStatus(ageGateConfig, user ?? null);
    if (!status.hasPassed) {
      return jsonError({
        message: "Age gate not passed. Complete age verification before creating chats.",
        status: HttpStatus.Forbidden,
        code: ErrorCode.Forbidden,
      });
    }
  }

  const { name, type, mode, participantIds, worldId, currentLocationId, turnStrategy } = body;

  if (!name || typeof name !== "string") {
    return jsonError({ message: "name is required", status: HttpStatus.BadRequest });
  }

  // Validate enum values
  const typeStr = type as string | undefined;
  const modeStr = mode as string | undefined;
  const turnStrategyStr = turnStrategy as string | undefined;

  const validTypes = new Set<string>(Object.values(ChatType));
  if (typeStr && !validTypes.has(typeStr)) {
    return jsonError({
      message: `Invalid chat type: ${typeStr}. Valid: ${[...validTypes].join(", ")}`,
      status: HttpStatus.BadRequest,
    });
  }

  const validModes = new Set<string>(Object.values(ChatMode));
  if (modeStr && !validModes.has(modeStr)) {
    return jsonError({
      message: `Invalid chat mode: ${modeStr}. Valid: ${[...validModes].join(", ")}`,
      status: HttpStatus.BadRequest,
    });
  }

  const validStrategies = new Set<string>(Object.values(TurnStrategy));
  if (turnStrategyStr && !validStrategies.has(turnStrategyStr)) {
    return jsonError({
      message: `Invalid turn strategy: ${turnStrategyStr}. Valid: ${[...validStrategies].join(", ")}`,
      status: HttpStatus.BadRequest,
    });
  }

  const chatId = uid();
  await database
    .insertInto("chats")
    .values({
      id: chatId,
      name: name,
      type: (type as ChatType) ?? ChatType.Direct,
      mode: (mode as ChatMode) ?? ChatMode.Direct,
      created_by: userId,
      world_id: (worldId as string | undefined) ?? null,
      current_location_id: (currentLocationId as string | undefined) ?? null,
      turn_strategy: turnStrategy as string as TurnStrategy | null,
    })
    .execute();

  // Add creator as participant
  await database
    .insertInto("chat_participants")
    .values({ chat_id: chatId, actor_id: userId, role_in_chat: "owner" })
    .execute();

  // Add additional participants if provided
  if (Array.isArray(participantIds)) {
    for (const actorId of participantIds as string[]) {
      try {
        await database
          .insertInto("chat_participants")
          .values({ chat_id: chatId, actor_id: actorId, role_in_chat: "member" })
          .execute();
      } catch (error: unknown) {
        getLogger()
          .child({ module: "chats" })
          .error("Failed to add participant", error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  // Insert welcome messages for character participants with a welcome_message set
  const characterActors = await database
    .selectFrom("chat_participants")
    .innerJoin("actors", "actors.id", "chat_participants.actor_id")
    .select(["chat_participants.actor_id", "actors.welcome_message"])
    .where("chat_participants.chat_id", "=", chatId)
    .where("actors.welcome_message", "is not", null)
    .execute();

  for (const actor of characterActors) {
    await database
      .insertInto("messages")
      .values({
        id: uid(),
        chat_id: chatId,
        actor_id: actor.actor_id,
        parent_id: null,
        role: MessageRole.Character,
        content: actor.welcome_message!,
        key_id: null,
        content_type: MessageContentType.Text,
        content_format: MessageContentFormat.Markdown,
        content_encoding: ContentEncoding.Identity,
        status: "confirmed",
        visibility: "visible",
        idempotency_key: null,
      })
      .execute();
  }

  return jsonCreated({ id: chatId });
}

async function handleGetChat({ database, chatId, context }: GetChatOpts): Promise<Response> {
  const userId = context.userId;
  if (!userId)
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });

  const chat = await database.selectFrom("chats").selectAll().where("id", "=", chatId).executeTakeFirst();
  if (!chat)
    return jsonError({ message: "Chat not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });
  if (chat.created_by !== userId && context.userRole !== "admin") {
    return jsonError({ message: "Chat not found", status: HttpStatus.NotFound });
  }

  const participants = await database
    .selectFrom("chat_participants")
    .selectAll()
    .where("chat_id", "=", chatId)
    .execute();

  return jsonResponse({ ...chat, participants });
}

async function handleUpdateChat({ database, chatId, body, context }: UpdateChatOpts): Promise<Response> {
  const userId = context.userId;
  if (!userId)
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });

  const chat = await database.selectFrom("chats").selectAll().where("id", "=", chatId).executeTakeFirst();
  if (!chat)
    return jsonError({ message: "Chat not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });
  if (chat.created_by !== userId)
    return jsonError({ message: "Forbidden", status: HttpStatus.Forbidden, code: ErrorCode.Forbidden });

  const updates: Record<string, unknown> = {};
  if (body.name) updates.name = body.name;
  if (body.mode) updates.mode = body.mode;
  if (body.turnStrategy) updates.turn_strategy = body.turnStrategy;
  if (body.worldId) updates.world_id = body.worldId;
  updates.updated_at = new Date().toISOString();

  await database.updateTable("chats").set(updates).where("id", "=", chatId).execute();

  return jsonResponse({ ok: true });
}

async function handleDeleteChat({ database, chatId, context }: DeleteChatOpts): Promise<Response> {
  const userId = context.userId;
  if (!userId)
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });

  const chat = await database.selectFrom("chats").selectAll().where("id", "=", chatId).executeTakeFirst();
  if (!chat)
    return jsonError({ message: "Chat not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });
  if (chat.created_by !== userId)
    return jsonError({ message: "Forbidden", status: HttpStatus.Forbidden, code: ErrorCode.Forbidden });

  // Delete related records first (FK order: no FK deps first, then leaf tables)
  await database.deleteFrom("generation_attempts").where("chat_id", "=", chatId).execute();
  await database
    .deleteFrom("world_states")
    .where((eb) =>
      eb.or([
        eb(
          "trigger_message_id",
          "in",
          database.selectFrom("messages").select("id").where("chat_id", "=", chatId),
        ),
        eb(
          "trigger_turn_id",
          "in",
          database.selectFrom("story_turns").select("id").where("chat_id", "=", chatId),
        ),
      ]),
    )
    .execute();
  await database.deleteFrom("story_turns").where("chat_id", "=", chatId).execute();
  await database.deleteFrom("quest_progress").where("chat_id", "=", chatId).execute();
  await database.deleteFrom("synthetic_data").where("chat_id", "=", chatId).execute();
  await database.deleteFrom("actor_memories").where("source_chat_id", "=", chatId).execute();
  await database
    .deleteFrom("asset_links")
    .where("entity_type", "=", "chat")
    .where("entity_id", "=", chatId)
    .execute();
  await database.deleteFrom("messages").where("chat_id", "=", chatId).execute();
  await database.deleteFrom("chat_participants").where("chat_id", "=", chatId).execute();
  await database.deleteFrom("chats").where("id", "=", chatId).execute();

  return jsonNoContent();
}

async function handleListParticipants({
  database,
  chatId,
  context,
}: ListParticipantsOpts): Promise<Response> {
  const userId = context.userId;
  if (!userId)
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });

  const chat = await database
    .selectFrom("chats")
    .select("created_by")
    .where("id", "=", chatId)
    .executeTakeFirst();
  if (!chat || (chat.created_by !== userId && context.userRole !== "admin")) {
    return jsonError({ message: "Chat not found", status: HttpStatus.NotFound });
  }

  const participants = await database
    .selectFrom("chat_participants")
    .selectAll()
    .where("chat_id", "=", chatId)
    .execute();

  return jsonResponse(participants);
}

async function handleAddParticipant({
  database,
  chatId,
  body,
  context,
}: AddParticipantOpts): Promise<Response> {
  const userId = context.userId;
  if (!userId)
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });

  const chat = await database
    .selectFrom("chats")
    .select("created_by")
    .where("id", "=", chatId)
    .executeTakeFirst();
  if (!chat || (chat.created_by !== userId && context.userRole !== "admin")) {
    return jsonError({ message: "Chat not found", status: HttpStatus.NotFound });
  }

  const actorId = body.actorId as string | undefined;
  if (!actorId) return jsonError({ message: "actorId is required", status: HttpStatus.BadRequest });

  const role = (body.role as string | undefined) ?? "member";

  try {
    await database
      .insertInto("chat_participants")
      .values({ chat_id: chatId, actor_id: actorId, role_in_chat: role as ChatParticipantRole })
      .execute();
  } catch (error: unknown) {
    getLogger()
      .child({ module: "chats" })
      .error("Failed to add participant", error instanceof Error ? error : new Error(String(error)));
  }

  return jsonCreated({ id: actorId });
}

async function handleRemoveParticipant({
  database,
  chatId,
  actorId,
  context,
}: RemoveParticipantOpts): Promise<Response> {
  const userId = context.userId;
  if (!userId)
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });

  const chat = await database
    .selectFrom("chats")
    .select("created_by")
    .where("id", "=", chatId)
    .executeTakeFirst();
  if (!chat || (chat.created_by !== userId && context.userRole !== "admin")) {
    return jsonError({ message: "Chat not found", status: HttpStatus.NotFound });
  }

  await database
    .deleteFrom("chat_participants")
    .where("chat_id", "=", chatId)
    .where("actor_id", "=", actorId)
    .execute();

  return jsonNoContent();
}

registerRoute(dispatch);
export { dispatch };

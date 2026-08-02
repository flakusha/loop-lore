import { Elysia, t, } from "elysia";
import { type Kysely, type SelectQueryBuilder, sql, } from "kysely";
import { getRuntimeConfig, } from "../age-gate/controller";
import { getStatus, } from "../age-gate/service";
import {
  batchArchiveChats,
  batchDeleteChats,
  batchExportChats,
  checkChatAccess,
  createChat,
  createChatSetupTemplate,
  deleteChat,
  deleteChatSetupTemplate,
  getChat,
  getChatSetupTemplate,
  listChatSetupTemplates,
  migrateChat,
  updateChat,
  updateChatSetupTemplate,
  updateImpersonation,
} from "../chat/service";
import type { Config, } from "../config/schema";
import {
  ChatParticipantRole,
  ContentEncoding,
  MessageContentFormat,
  MessageContentType,
  MessageRole,
} from "../db/enums";
import type { DB, } from "../db/schema";
import { isLlmGenerationConfigured, triggerAutoGeneration, } from "../generation/auto-gen";
import { getLogger, type Logger, } from "../logger";
import { notifyChatInvite, } from "../notifications/service";
import { safeJsonStringify, uid, } from "../utils";
import {
  BatchIdsBody,
  ChatCreateBody,
  ChatIdParams,
  ChatImpersonateBody,
  ChatLocationUpdateBody,
  ChatMarkReadBody,
  ChatMigrateBody,
  ChatParticipantParams,
  ChatParticipantUpdateBody,
  ChatPersonaUpdateBody,
  ChatRenameBody,
  ChatSetupTemplateCreateBody,
  ChatSetupTemplateSchema,
  ChatSetupTemplateUpdateBody,
  ChatUpdateBody,
  ErrorResponse,
} from "../validation/schemas";
import { autoSyncChatBackground, } from "./chat-backgrounds";
import {
  forbiddenResponse as forbidden,
  HttpStatus,
  type HttpStatusCode,
  jsonCreated,
  jsonError,
  jsonNoContent,
  jsonPaginated,
  jsonResponse,
  notFoundResponse as notFound,
  requireUserId,
} from "./http-utils";

function log(): Logger {
  return getLogger().child({ module: "chats", },);
}

interface HandlerOpts {
  database: Kysely<DB>;
  config: Config;
}

/**
 * Query params for GET /api/chats. Filters are optional and compose with AND;
 * when absent the list behaves exactly as before (all chats, recent-first).
 *
 * - `type`: "direct" | "group" (omit = all types)
 * - `archived`: "true" / "1" -> only archived; "false" / "0" -> only active.
 *   Archive state lives on `chats.is_pinned` (PinnedState: unpinned|pinned|archived),
 *   so "active" = is_pinned != 'archived'. Omit = both.
 * - `sort`: "recent" (default) | "name" | "unread" | "pinned-first"
 */
const archivedTrue = t.Literal("true",);
const archivedFalse = t.Literal("false",);
const archivedOne = t.Literal("1",);
const archivedZero = t.Literal("0",);

const ChatListQuery = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1, default: 1, },),),
  pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: 200, default: 50, },),),
  type: t.Optional(t.Enum({ direct: "direct", group: "group", },),),
  archived: t.Optional(t.Union([archivedTrue, archivedFalse, archivedOne, archivedZero,],),),
  sort: t.Optional(t.UnionEnum(["recent", "name", "unread", "pinned-first",],),),
},);

/**
 * Apply the requested `sort` to a chat list query. Defaults to recent-first
 * ("updated_at" desc). "unread" orders by newer-than-last-read visible message
 * count (same semantics as routes/activity.ts), then by recency.
 */
function orderChatList<T,>(
  query: SelectQueryBuilder<DB, "chats", T>,
  sort: string,
  userId: string,
): SelectQueryBuilder<DB, "chats", T> {
  switch (sort) {
    case "name": {
      return query.orderBy("name", "asc",).orderBy("updated_at", "desc",);
    }
    case "pinned-first": {
      return query
        .orderBy((eb,) => eb.case().when("is_pinned", "=", "pinned",).then(0,).else(1,).end(), "asc",)
        .orderBy("updated_at", "desc",);
    }
    case "unread": {
      // Correlated scalar subquery: count of visible messages newer than the
      // participant's last read message (COALESCE('') => never-read counts all).
      // This rule dislikes the wrapped template indentation; keep the SQL
      // stable by disabling it for this one expression.
      // eslint-disable-next-line unicorn/template-indent
      const unreadSub = sql<number>`(
        SELECT COUNT(*)
        FROM messages m
        WHERE m.chat_id = chats.id
          AND m.visibility = 'visible'
          AND m.created_at > COALESCE((
            SELECT lastm.created_at FROM messages lastm
            WHERE lastm.id = (
              SELECT cp.last_read_message_id FROM chat_participants cp
              WHERE cp.chat_id = chats.id AND cp.actor_id = ${userId}
            )
          ), '')
      )`;
      return query.orderBy(unreadSub, "desc",).orderBy("updated_at", "desc",);
    }
    default: {
      return query.orderBy("updated_at", "desc",);
    }
  }
}

export function chatsRoutes(opts: HandlerOpts,) {
  const { database, } = opts;

  return (
    new Elysia({ name: "chats", },)
      // Capture raw request body text so handlers can distinguish fields the
      // client explicitly sent from Elysia's auto-applied enum defaults
      // (e.g. mode → "direct", turnStrategy → "round_robin").
      .onParse(async (ctx: any, contentType: string,) => {
        if (!contentType.includes("application/json",)) {
          return;
        }
        const text = await ctx.request.text();
        (ctx as { rawBodyText?: string }).rawBodyText = text;
        return JSON.parse(text,);
      },)
      .get(
        "/api/chats",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const page = (ctx.query.page as number) ?? 1;
          const pageSize = (ctx.query.pageSize as number) ?? 20;
          const offset = (page - 1) * pageSize;
          const type = ctx.query.type as "direct" | "group" | undefined;
          const archived = ctx.query.archived as string | undefined;
          const sort = (ctx.query.sort as string | undefined) ?? "recent";

          // Shared filters. Archive state lives on chats.is_pinned
          // (PinnedState enum: unpinned | pinned | archived).
          let countQuery = database
            .selectFrom("chats",)
            .select(database.fn.countAll<number>().as("total",),)
            .where("created_by", "=", userId,);
          let listQuery = database
            .selectFrom("chats",)
            .selectAll()
            .where("created_by", "=", userId,);

          if (type) {
            countQuery = countQuery.where("type", "=", type,);
            listQuery = listQuery.where("type", "=", type,);
          }
          if (archived !== undefined) {
            const isArchived = archived === "true" || archived === "1";
            countQuery = countQuery.where("is_pinned", isArchived ? "=" : "!=", "archived",);
            listQuery = listQuery.where("is_pinned", isArchived ? "=" : "!=", "archived",);
          }

          const countResult = await countQuery.executeTakeFirst();
          const total = countResult?.total ?? 0;

          listQuery = orderChatList(listQuery, sort, userId,);

          const chats = await listQuery.limit(pageSize,).offset(offset,).execute();
          return jsonPaginated({ data: chats, total, page, pageSize, },);
        },
        { query: ChatListQuery, },
      )
      .post(
        "/api/chats",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }

          const ageGateConfig = getRuntimeConfig();
          if (ageGateConfig.enabled && ageGateConfig.mode !== "none") {
            const user = await database
              .selectFrom("users",)
              .select(["birth_date", "age_gate_accepted_at",],)
              .where("id", "=", userId,)
              .executeTakeFirst();
            const st = getStatus(ageGateConfig, user ?? null,);
            if (!st.hasPassed) { return forbidden("Age gate not passed",); }
          }

          const body = ctx.body as typeof ChatCreateBody.static;

          // Elysia applies defaults to optional enum fields (mode → "direct",
          // type → "direct", turnStrategy → "round_robin"), so we can't tell from
          // `body` alone which fields the client explicitly sent. Use the raw
          // body captured by onParse so template seeding wins unless overridden.
          let rawBody: Record<string, unknown> = {};
          const rawText = (ctx as { rawBodyText?: string }).rawBodyText;
          if (rawText) {
            try {
              rawBody = JSON.parse(rawText,) as Record<string, unknown>;
            } catch {
              rawBody = {};
            }
          }
          const hasExplicit = (key: string,) => key in rawBody;

          // Seed key mechanics from a template if provided (explicit fields override)
          let template = null;
          if (body.templateId || hasExplicit("templateId",)) {
            const templateId = body.templateId ?? (rawBody.templateId as string | undefined);
            template = templateId ? await getChatSetupTemplate(database, templateId,) : null;
            if (!template) { return notFound("Chat setup template not found",); }
          }

          const newChatId = await createChat(database, {
            name: body.name,
            type: body.type,
            mode: hasExplicit("mode",) ? body.mode : template?.mode ?? undefined,
            createdBy: userId,
            worldId: hasExplicit("worldId",) ? body.worldId : template?.world_id ?? undefined,
            currentLocationId: body.currentLocationId,
            turnStrategy: hasExplicit("turnStrategy",) ? body.turnStrategy : template?.turn_strategy ?? undefined,
            participantIds: body.participantIds,
            gmConfig: hasExplicit("gmConfig",)
              ? body.gmConfig
              : (template?.gm_config ? JSON.parse(template.gm_config,) : undefined),
            visualNovel: hasExplicit("visualNovel",)
              ? body.visualNovel
              : (template ? template.visual_novel === 1 : undefined),
            templateId: template?.id,
            memoryCarry: body.memoryCarry,
            memoryCarryIds: body.memoryCarryIds,
          },);

          const characterActors = await database
            .selectFrom("chat_participants",)
            .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
            .select(["chat_participants.actor_id", "actors.welcome_message",],)
            .where("chat_participants.chat_id", "=", newChatId,)
            .where("actors.welcome_message", "is not", null,)
            .execute();

          for (const actor of characterActors) {
            await database
              .insertInto("messages",)
              .values({
                id: uid(),
                chat_id: newChatId,
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
              },)
              .execute();
          }

          // If no welcome message was created for any participant, trigger
          // LLM auto-generation so the assistant sends an initial greeting.
          if (characterActors.length === 0 && body.participantIds && body.participantIds.length > 0) {
            const { database: db, config, } = opts;
            if (isLlmGenerationConfigured(config,)) {
              void triggerAutoGeneration({
                database: db,
                config,
                chatId: newChatId,
                parentMessageId: null,
                userId,
              },);
            }
          }

          return jsonCreated({ id: newChatId, },);
        },
        { body: ChatCreateBody, },
      )
      .get(
        "/api/chat-setup-templates",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const templates = await listChatSetupTemplates(database,);
          const payload = templates.map((tmpl,) => ({
            id: tmpl.id,
            slug: tmpl.slug,
            name: tmpl.name,
            description: tmpl.description,
            mode: tmpl.mode,
            turnStrategy: tmpl.turn_strategy,
            worldId: tmpl.world_id,
            gmConfig: tmpl.gm_config ? JSON.parse(tmpl.gm_config,) : null,
            visualNovel: tmpl.visual_novel === 1,
          }));
          return jsonResponse(payload,);
        },
        { response: { 200: t.Array(ChatSetupTemplateSchema,), }, },
      )
      .post(
        "/api/chat-setup-templates",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          if (ctx.userRole !== "admin") {
            return forbidden(ctx.t?.("errors.forbidden",) ?? "Forbidden",);
          }
          const body = ctx.body as typeof ChatSetupTemplateCreateBody.static;
          const result = await createChatSetupTemplate(database, {
            slug: body.slug,
            name: body.name,
            description: body.description ?? null,
            mode: body.mode ?? null,
            turnStrategy: body.turnStrategy ?? null,
            worldId: body.worldId ?? null,
            gmConfig: body.gmConfig ?? null,
            visualNovel: body.visualNovel ?? false,
          },);
          if (!result.ok) {
            if (result.code === "conflict") {
              return jsonError({ message: result.message, status: HttpStatus.Conflict, },);
            }
            return jsonError({ message: result.message, status: HttpStatus.BadRequest, },);
          }
          return jsonCreated(result.template,);
        },
        {
          body: ChatSetupTemplateCreateBody,
          response: { 201: ChatSetupTemplateSchema, 401: ErrorResponse, 403: ErrorResponse, 409: ErrorResponse, },
        },
      )
      .put(
        "/api/chat-setup-templates/:templateId",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          if (ctx.userRole !== "admin") {
            return forbidden(ctx.t?.("errors.forbidden",) ?? "Forbidden",);
          }
          const body = ctx.body as typeof ChatSetupTemplateUpdateBody.static | undefined;
          const result = await updateChatSetupTemplate(database, ctx.params.templateId, {
            name: body?.name,
            description: body?.description,
            mode: body?.mode,
            turnStrategy: body?.turnStrategy,
            worldId: body?.worldId,
            gmConfig: body?.gmConfig,
            visualNovel: body?.visualNovel,
          },);
          if (!result.ok) {
            if (result.code === "not_found") { return notFound("Template not found",); }
            return jsonError({ message: result.message, status: HttpStatus.BadRequest, },);
          }
          return jsonResponse(result.template,);
        },
        {
          params: t.Object({ templateId: t.String(), },),
          body: ChatSetupTemplateUpdateBody,
          response: { 200: ChatSetupTemplateSchema, 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, },
        },
      )
      .delete(
        "/api/chat-setup-templates/:templateId",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          if (ctx.userRole !== "admin") {
            return forbidden(ctx.t?.("errors.forbidden",) ?? "Forbidden",);
          }
          const result = await deleteChatSetupTemplate(database, ctx.params.templateId,);
          if (!result.ok) {
            if (result.code === "not_found") { return notFound("Template not found",); }
            return jsonError({ message: result.message, status: HttpStatus.BadRequest, },);
          }
          return jsonNoContent();
        },
        {
          params: t.Object({ templateId: t.String(), },),
          response: { 204: t.Void(), 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, },
        },
      )
      .post(
        "/api/chats/:id/migrate",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;
          const body = ctx.body as typeof ChatMigrateBody.static;

          const access = await checkChatAccess(database, id, userId, userRole,);
          if (!access.ok) { return forbidden(); }

          const result = await migrateChat(database, id, {
            templateId: body.templateId,
            createdBy: userId,
            name: body.name,
            carry: body.carry,
          },);
          if ("code" in result) {
            const status = result.code === "not_found"
              ? HttpStatus.NotFound
              : (result.code === "forbidden" ? HttpStatus.Forbidden : HttpStatus.BadRequest);
            return jsonError(result.message, status, result.code as never,);
          }
          return jsonCreated({ newChatId: result.newChatId, sourceChatId: result.sourceChatId, },);
        },
        { body: ChatMigrateBody, params: ChatIdParams, },
      )
      // ── Batch chat operations ──────────────────────────────────
      .post(
        "/api/chats/batch/archive",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const ids = (ctx.body as { ids: string[] }).ids;
          const archived = await batchArchiveChats(database, ids, userId,);
          if (archived.length === 0) { return notFound("No chats found",); }
          return jsonResponse({ ok: true, archived: archived.length, },);
        },
        { body: BatchIdsBody, },
      )
      .post(
        "/api/chats/batch/delete",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const ids = (ctx.body as { ids: string[] }).ids;
          const deleted = await batchDeleteChats(database, ids, userId,);
          if (deleted === 0) { return notFound("No chats found",); }
          return jsonResponse({ ok: true, deleted, },);
        },
        { body: BatchIdsBody, },
      )
      .post(
        "/api/chats/batch/export",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const ids = (ctx.body as { ids: string[] }).ids;
          const exportData = await batchExportChats(database, ids, userId,);
          if (!exportData) { return notFound("No chats found",); }
          const json = safeJsonStringify(exportData,);
          return new Response(json.ok ? json.value : "[]", {
            headers: {
              "Content-Type": "application/json",
              "Content-Disposition": 'attachment; filename="chats-export.json"',
            },
          },);
        },
        { body: BatchIdsBody, },
      )
      .get(
        "/api/chats/:id",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;

          const access = await checkChatAccess(database, id, userId, userRole,);
          if (!access.ok) { return notFound(access.error.message,); }

          const result = await getChat(database, id,);
          if (!result) { return notFound("Chat not found",); }
          return jsonResponse({ ...result.chat, participants: result.participants, },);
        },
        { params: ChatIdParams, },
      )
      .put(
        "/api/chats/:id",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;
          const body = ctx.body as typeof ChatUpdateBody.static;

          const access = await checkChatAccess(database, id, userId, userRole,);
          if (!access.ok) { return forbidden(); }

          // Only pass key-mechanic fields when the client explicitly sent them —
          // Elysia defaults optional enums (mode → "direct", turnStrategy →
          // "round_robin"), which would otherwise trip the online immutability guard.
          let rawBody: Record<string, unknown> = {};
          const rawText = (ctx as { rawBodyText?: string }).rawBodyText;
          if (rawText) {
            try {
              rawBody = JSON.parse(rawText,) as Record<string, unknown>;
            } catch {
              rawBody = {};
            }
          }
          const hasExplicit = (key: string,) => key in rawBody;

          const result = await updateChat(database, id, {
            name: body.name,
            mode: hasExplicit("mode",) ? body.mode : undefined,
            turnStrategy: hasExplicit("turnStrategy",) ? body.turnStrategy : undefined,
            worldId: hasExplicit("worldId",) ? body.worldId : undefined,
            isPinned: body.isPinned,
            isPaused: body.isPaused,
            freezePanel: body.freezePanel,
            gmConfig: hasExplicit("gmConfig",) ? body.gmConfig : undefined,
            visualNovel: hasExplicit("visualNovel",) ? body.visualNovel : undefined,
            userRole,
          },);
          if ("code" in result) {
            const statusMap: Record<string, HttpStatusCode> = {
              not_found: HttpStatus.NotFound,
              forbidden: HttpStatus.Forbidden,
              key_mechanic_conflict: HttpStatus.Conflict,
            };
            const status = statusMap[result.code] ?? HttpStatus.BadRequest;
            return jsonError(result.message, status, result.code as never,);
          }
          return jsonResponse({ ok: true, },);
        },
        { body: ChatUpdateBody, params: ChatIdParams, },
      )
      .post(
        "/api/chats/:id/rename",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;
          const body = ctx.body as typeof ChatRenameBody.static;

          const access = await checkChatAccess(database, id, userId, userRole,);
          if (!access.ok) { return forbidden(); }

          // Validate name length (1-60 characters)
          if (!body.name || body.name.length === 0 || body.name.length > 60) {
            return jsonError("Chat name must be 1-60 characters", HttpStatus.BadRequest, "validation_error" as never,);
          }

          // Check for duplicate name among user's chats
          const existing = await database
            .selectFrom("chats",)
            .select("id",)
            .where("created_by", "=", userId,)
            .where("name", "=", body.name,)
            .where("id", "!=", id,)
            .executeTakeFirst();
          if (existing) {
            return jsonError(
              "A chat with this name is already in use",
              HttpStatus.BadRequest,
              "duplicate_name" as never,
            );
          }

          // Update name and name_source
          await database
            .updateTable("chats",)
            .set({
              name: body.name,
              name_source: body.name_source ?? null,
            },)
            .where("id", "=", id,)
            .execute();

          return jsonResponse({ ok: true, },);
        },
        { body: ChatRenameBody, params: ChatIdParams, },
      )
      .delete(
        "/api/chats/:id",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;

          const access = await checkChatAccess(database, id, userId, userRole,);
          if (!access.ok) { return forbidden(); }

          await deleteChat(database, id,);
          return jsonNoContent();
        },
        { params: ChatIdParams, },
      )
      .get(
        "/api/chats/:id/export",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;

          const chat = await database
            .selectFrom("chats",)
            .select("created_by",)
            .where("id", "=", id,)
            .executeTakeFirst();
          if (!chat || (chat.created_by !== userId && userRole !== "admin")) {
            return notFound("Chat not found",);
          }

          const messages = await database
            .selectFrom("messages",)
            .selectAll()
            .where("chat_id", "=", id,)
            .orderBy("created_at", "asc",)
            .execute();
          const participants = await database
            .selectFrom("chat_participants",)
            .selectAll()
            .where("chat_id", "=", id,)
            .execute();

          const actorIds = new Set<string>();
          for (const m of messages) { if (m.actor_id) { actorIds.add(m.actor_id,); } }
          for (const p of participants) { actorIds.add(p.actor_id,); }

          const actors = actorIds.size > 0
            ? await database
              .selectFrom("actors",)
              .select(["id", "display_name", "actor_type",],)
              .where("id", "in", [...actorIds,],)
              .execute()
            : [];
          const assetLinks = await database
            .selectFrom("asset_links",)
            .select(["asset_id", "entity_type", "entity_id", "label",],)
            .where("entity_id", "=", id,)
            .execute();

          const chatData = await database
            .selectFrom("chats",)
            .selectAll()
            .where("id", "=", id,)
            .executeTakeFirst();
          const format = ((ctx.query as { format?: string }).format ?? "") === "md" ? "md" : "json";

          if (format === "md") {
            const lines: string[] = [`# ${chatData?.name ?? "Chat"}`, "",];
            const actorName = new Map(actors.map((a,) => [a.id, a.display_name,]),);
            const roleLabel: Record<string, string> = {
              system: "System",
              assistant: "Assistant",
              user: "User",
              tool: "Tool",
            };
            for (const m of messages) {
              const who = m.actor_id ? (actorName.get(m.actor_id,) ?? m.role) : (roleLabel[m.role] ?? m.role);
              lines.push(`**${who}:** ${m.content ?? ""}`, "",);
            }
            const md = lines.join("\n",);
            const safeName = (chatData?.name || "chat").replaceAll(/[^\w.-]+/g, "_",);
            return new Response(md, {
              headers: {
                "Content-Type": "text/markdown; charset=utf-8",
                "Content-Disposition": `attachment; filename="${safeName}.md"`,
              },
            },);
          }

          const exportStr = safeJsonStringify({ chat: chatData, participants, messages, actors, assetLinks, },);
          const safeName = (chatData?.name || "chat").replaceAll(/[^\w.-]+/g, "_",);
          return new Response(exportStr.ok ? exportStr.value : "{}", {
            headers: {
              "Content-Type": "application/json",
              "Content-Disposition": `attachment; filename="${safeName}.json"`,
            },
          },);
        },
        { params: ChatIdParams, },
      )
      .get(
        "/api/chats/:id/participants",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;

          const chat = await database
            .selectFrom("chats",)
            .select("created_by",)
            .where("id", "=", id,)
            .executeTakeFirst();
          if (!chat || (chat.created_by !== userId && userRole !== "admin")) {
            return notFound("Chat not found",);
          }

          const participants = await database
            .selectFrom("chat_participants",)
            .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
            .select([
              "chat_participants.chat_id",
              "chat_participants.actor_id",
              "chat_participants.role_in_chat",
              "chat_participants.talkativity",
              "chat_participants.initiative",
              "chat_participants.joined_at",
              "chat_participants.last_read_message_id",
              "chat_participants.impersonate_actor_id",
              "chat_participants.persona_id",
              "actors.display_name",
              "actors.actor_type",
            ],)
            .where("chat_participants.chat_id", "=", id,)
            .execute();
          return jsonResponse(participants,);
        },
        { params: ChatIdParams, },
      )
      .post(
        "/api/chats/:id/participants",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;
          const body = ctx.body as { actorId: string; role?: string };

          const chat = await database
            .selectFrom("chats",)
            .select("created_by",)
            .where("id", "=", id,)
            .executeTakeFirst();
          if (!chat || (chat.created_by !== userId && userRole !== "admin")) {
            return notFound("Chat not found",);
          }

          const role = body.role ?? "member";
          try {
            await database
              .insertInto("chat_participants",)
              .values({ chat_id: id, actor_id: body.actorId, role_in_chat: role as ChatParticipantRole, },)
              .execute();

            // Distribute encryption keys if chat is encrypted
            const chatRecord = await database
              .selectFrom("chats",)
              .select("encryption_level",)
              .where("id", "=", id,)
              .executeTakeFirst();

            if (chatRecord?.encryption_level === "standard") {
              try {
                const { distributeKeysOnJoin, } = await import("../crypto/key-distribution");
                await distributeKeysOnJoin(database, id, body.actorId,);
                log().info("Distributed encryption keys to new participant", {
                  chatId: id,
                  participantId: body.actorId,
                },);
              } catch (keyError) {
                log().warn("Failed to distribute keys (non-fatal)", {
                  chatId: id,
                  participantId: body.actorId,
                  error: String(keyError,),
                },);
              }
            }

            void notifyChatInvite(database, {
              chatId: id,
              invitedUserId: body.actorId,
              inviterId: userId,
            },).catch(() => {},);
          } catch {
            /* skip duplicate */
          }
          return jsonCreated({ id: body.actorId, },);
        },
        {
          params: ChatIdParams,
          // eslint-disable-next-line unicorn/max-nested-calls
          body: t.Object({ actorId: t.String({ minLength: 1, },), role: t.Optional(t.String(),), },),
        },
      )
      .put(
        "/api/chats/:id/participants/:actorId",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const { id, actorId, } = ctx.params as { id: string; actorId: string };
          const body = ctx.body as typeof ChatParticipantUpdateBody.static;

          const chat = await database
            .selectFrom("chats",)
            .select("created_by",)
            .where("id", "=", id,)
            .executeTakeFirst();
          if (!chat || (chat.created_by !== userId && userRole !== "admin")) {
            return notFound("Chat not found",);
          }

          const updates: Record<string, unknown> = {};
          if (typeof body.talkativity === "number") {
            updates.talkativity = Math.min(10, Math.max(1, body.talkativity,),);
          }
          if (typeof body.initiative === "number") { updates.initiative = body.initiative; }
          if (typeof body.role === "string") { updates.role_in_chat = body.role; }

          if (Object.keys(updates,).length === 0) {
            return jsonError({ message: "No valid fields to update", status: HttpStatus.BadRequest, },);
          }
          await database
            .updateTable("chat_participants",)
            .set(updates,)
            .where("chat_id", "=", id,)
            .where("actor_id", "=", actorId,)
            .execute();
          return jsonResponse({ ok: true, },);
        },
        { params: ChatParticipantParams, body: ChatParticipantUpdateBody, },
      )
      .delete(
        "/api/chats/:id/participants/:actorId",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const { id, actorId, } = ctx.params as { id: string; actorId: string };

          const chat = await database
            .selectFrom("chats",)
            .select("created_by",)
            .where("id", "=", id,)
            .executeTakeFirst();
          if (!chat || (chat.created_by !== userId && userRole !== "admin")) {
            return notFound("Chat not found",);
          }

          await database
            .deleteFrom("chat_participants",)
            .where("chat_id", "=", id,)
            .where("actor_id", "=", actorId,)
            .execute();

          // Rotate encryption key on participant leave (forward secrecy)
          const chatRecord = await database
            .selectFrom("chats",)
            .select("encryption_level",)
            .where("id", "=", id,)
            .executeTakeFirst();

          if (chatRecord?.encryption_level === "standard") {
            try {
              const { rotateKeyOnLeave, } = await import("../crypto/key-distribution");
              await rotateKeyOnLeave(database, id, actorId,);
              log().info("Rotated encryption key after participant leave", {
                chatId: id,
                departedParticipantId: actorId,
              },);
            } catch (keyError) {
              log().warn("Failed to rotate key on leave (non-fatal)", {
                chatId: id,
                departedParticipantId: actorId,
                error: String(keyError,),
              },);
            }
          }

          return jsonNoContent();
        },
        { params: ChatParticipantParams, },
      )
      .put(
        "/api/chats/:id/location",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;
          const body = ctx.body as typeof ChatLocationUpdateBody.static;

          const chat = await database
            .selectFrom("chats",)
            .select("created_by",)
            .where("id", "=", id,)
            .executeTakeFirst();
          if (!chat || (chat.created_by !== userId && userRole !== "admin")) {
            return notFound("Chat not found",);
          }

          const fullChat = await database
            .selectFrom("chats",)
            .selectAll()
            .where("id", "=", id,)
            .executeTakeFirst();
          if (!fullChat) { return notFound("Chat not found",); }

          if (!fullChat.world_id) {
            return jsonError({ message: "Chat has no world assigned", status: HttpStatus.BadRequest, },);
          }

          const locationId = body.locationId;
          if (locationId === null) {
            await database
              .updateTable("chats",)
              .set({ current_location_id: null, updated_at: new Date().toISOString(), },)
              .where("id", "=", id,)
              .execute();
            return jsonResponse({ ok: true, current_location_id: null, },);
          }

          const location = await database
            .selectFrom("locations",)
            .select(["id", "name",],)
            .where("id", "=", locationId,)
            .where("world_id", "=", fullChat.world_id,)
            .executeTakeFirst();
          if (!location) { return notFound("Location not found in this world",); }

          await database
            .updateTable("chats",)
            .set({ current_location_id: locationId, updated_at: new Date().toISOString(), },)
            .where("id", "=", id,)
            .execute();

          // Location-scoped background auto-sync (additive; doesn't move the
          // single current_location_id link or any 401-guard logic).
          await autoSyncChatBackground(database, id, locationId,);
          return jsonResponse({ ok: true, current_location_id: locationId, location_name: location.name, },);
        },
        { body: ChatLocationUpdateBody, params: ChatIdParams, },
      )
      .put(
        "/api/chats/:id/persona",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;
          const body = ctx.body as typeof ChatPersonaUpdateBody.static;

          const chat = await database
            .selectFrom("chats",)
            .select("created_by",)
            .where("id", "=", id,)
            .executeTakeFirst();
          if (!chat || (chat.created_by !== userId && userRole !== "admin")) {
            return notFound("Chat not found",);
          }

          await database
            .updateTable("chat_participants",)
            .set({ persona_id: body.personaId ?? null, },)
            .where("chat_id", "=", id,)
            .where("actor_id", "=", userId,)
            .execute();
          return jsonResponse({ ok: true, },);
        },
        { body: ChatPersonaUpdateBody, params: ChatIdParams, },
      )
      .put(
        "/api/chats/:id/impersonate",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;
          const body = ctx.body as typeof ChatImpersonateBody.static;

          const chat = await database
            .selectFrom("chats",)
            .select("created_by",)
            .where("id", "=", id,)
            .executeTakeFirst();
          if (!chat || (chat.created_by !== userId && userRole !== "admin")) {
            return notFound("Chat not found",);
          }

          const result = await updateImpersonation(database, id, userId, body.impersonateActorId ?? null,);
          if (result && "code" in result) {
            const status = result.code === "not_found"
              ? HttpStatus.NotFound
              : (result.code === "forbidden" ? HttpStatus.Forbidden : HttpStatus.BadRequest);
            return jsonError(result.message, status, result.code as never,);
          }
          return jsonResponse({ ok: true, },);
        },
        { body: ChatImpersonateBody, params: ChatIdParams, },
      )
      .put(
        "/api/chats/:id/mark-read",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const id = (ctx.params as { id: string }).id;
          const body = ctx.body as typeof ChatMarkReadBody.static;

          const participant = await database
            .selectFrom("chat_participants",)
            .select(["chat_id",],)
            .where("chat_id", "=", id,)
            .where("actor_id", "=", userId,)
            .executeTakeFirst();
          if (!participant) { return forbidden("Not a participant of this chat",); }

          const message = await database
            .selectFrom("messages",)
            .select(["id",],)
            .where("id", "=", body.messageId,)
            .where("chat_id", "=", id,)
            .executeTakeFirst();
          if (!message) { return notFound("Message not found in this chat",); }

          await database
            .updateTable("chat_participants",)
            .set({ last_read_message_id: body.messageId, },)
            .where("chat_id", "=", id,)
            .where("actor_id", "=", userId,)
            .execute();

          return jsonResponse({ ok: true, },);
        },
        { body: ChatMarkReadBody, params: ChatIdParams, },
      )
  );
}

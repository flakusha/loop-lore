import { Elysia, } from "elysia";
import { checkChatAccess, deleteChat, getChat, migrateChat, updateChat, } from "../../chat/service";
import { resolveSystemPrompt, } from "../../prompts";
import { jsonParseOr, } from "../../utils";
import { ChatIdParams, ChatMigrateBody, ChatRenameBody, ChatUpdateBody, } from "../../validation/schemas";
import {
  forbiddenResponse as forbidden,
  HttpStatus,
  type HttpStatusCode,
  jsonCreated,
  jsonError,
  jsonNoContent,
  jsonResponse,
  notFoundResponse as notFound,
  requireUserId,
} from "../http-utils";
import type { HandlerOpts, } from "./types";
import { gmGuidanceRoutes, } from "./gm-guidance";

export function manageRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, config, } = opts;

  return (
    new Elysia({ name: "chats-manage", },)
      .post(
        prefix + "/chats/:id/migrate",
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
      .get(
        prefix + "/chats/:id",
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
        prefix + "/chats/:id",
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
            rawBody = jsonParseOr(rawText, {},);
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
        prefix + "/chats/:id/rename",
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
        prefix + "/chats/:id",
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
        prefix + "/chats/:id/prompt-template",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;

          const access = await checkChatAccess(database, id, userId, userRole,);
          if (!access.ok) { return notFound(access.error.message,); }

          const result = await getChat(database, id,);
          if (!result) { return notFound("Chat not found",); }

          const chat = result.chat;
          const mode = (chat.mode as string) ?? "story";
          const gmConfig = chat.gm_config
            ? jsonParseOr<Record<string, unknown>>(chat.gm_config as string, {},)
            : {};

          // Determine the prompt purpose from chat mode + assistant role
          const assistantRole = gmConfig.assistantRole as string | undefined;
          let purpose = "chat";
          if (mode === "story") {
            purpose = assistantRole === "gm" ? "gm" : "chat";
          }

          // Find the primary character's system prompt from participants
          const participants = result.participants;
          const characterParticipant = participants.find(
            (p: Record<string, unknown>,) => p.actor_type === "character" && p.role_in_chat !== "owner",
          );

          let characterPrompt: string | null = null;
          let characterName: string | null = null;
          if (characterParticipant) {
            const actorId = characterParticipant.actor_id as string;
            const actor = await database
              .selectFrom("actors",)
              .select(["system_prompt", "display_name",],)
              .where("id", "=", actorId,)
              .executeTakeFirst();
            if (actor) {
              characterPrompt = actor.system_prompt ?? null;
              characterName = actor.display_name ?? null;
            }
          }

          // Resolve: character prompt > config override > registry default
          const registryDefault = resolveSystemPrompt(config.templates?.llm, purpose,);
          const prompt = characterPrompt || registryDefault;
          const source = characterPrompt ? "character" : "registry";

          return jsonResponse({
            purpose,
            prompt,
            source,
            characterName,
            registryDefault,
          },);
        },
        { params: ChatIdParams, },
      )
      .use(gmGuidanceRoutes(opts, prefix,),)
  );
}

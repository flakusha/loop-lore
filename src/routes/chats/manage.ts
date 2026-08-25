// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { checkChatAccess, deleteChat, getChat, migrateChat, updateChat, } from "../../chat/service";
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
import { gmGuidanceRoutes, } from "./gm-guidance";
import { promptTemplateRoutes, } from "./prompt-template";
import type { HandlerOpts, } from "./types";

export function manageRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "chats-manage", },)
      .post(
        `${prefix}/chats/:id/migrate`,
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
        `${prefix}/chats/:id`,
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
        `${prefix}/chats/:id`,
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
            thinkingVisibility: body.thinkingVisibility,
            promptOverride: hasExplicit("promptOverride",) ? body.promptOverride : undefined,
            quickReplies: hasExplicit("quickReplies",) ? body.quickReplies : undefined,
            outputStylePreset: hasExplicit("outputStylePreset",) ? body.outputStylePreset : undefined,
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
        `${prefix}/chats/:id/rename`,
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
        `${prefix}/chats/:id`,
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
      .use(gmGuidanceRoutes(opts, prefix,),)
      .use(promptTemplateRoutes(opts, prefix,),)
  );
}

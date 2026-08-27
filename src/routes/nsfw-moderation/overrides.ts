// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW Moderation — per-chat / per-world override, plus effective-NSFW lookup.
 */
import { Elysia, t, } from "elysia";
import { checkChatAccess, } from "../../chat/service";
import { NsfwModerationService, } from "../../nsfw/moderation-service";
import { notFound, } from "../../validation/middleware";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonResponse, requireUserId, } from "../http-utils";
import { requireModerationAction, } from "./shared";
import type { HandlerOpts, } from "./types";

const nsfwOverrideBody = t.Object({
  override: t.Union([t.Literal("enabled",), t.Literal("disabled",), t.Null(),],),
},);

export function overridesRoutes(opts: HandlerOpts, prefix = "/api",) {
  const svc = new NsfwModerationService(opts.database,);
  const database = opts.database;

  return (
    new Elysia({ name: "nsfw-moderation-overrides", },)
      .get(`${prefix}/nsfw/moderation/effective/:chatId`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const access = await checkChatAccess(
          database,
          ctx.params.chatId,
          userId,
          (ctx.userRole as string | null) ?? null,
        );
        if (!access.ok) { return notFound("Chat not found",); }
        try {
          const result = await svc.getEffectiveNsfw(
            ctx.params.chatId,
            userId,
          );
          return jsonResponse({ ...SuccessResponse, data: result, },);
        } catch (error: unknown) {
          return jsonError(error instanceof Error ? error.message : String(error,), 500,);
        }
      }, { params: t.Object({ chatId: t.String(), },), response: { 200: SuccessResponse, 500: ErrorResponse, }, },)
      .put(`${prefix}/nsfw/moderation/chat/:chatId`, async (ctx: any,) => {
        const auth = requireModerationAction(ctx,);
        if (typeof auth !== "string") { return auth; }
        // Chat-scoped guard: the moderator must also be able to access the
        // chat they are flipping the override on.
        const access = await checkChatAccess(
          database,
          ctx.params.chatId,
          auth,
          (ctx.userRole as string | null) ?? null,
        );
        if (!access.ok) { return notFound("Chat not found",); }
        try {
          const { override, } = ctx.body as { override: "enabled" | "disabled" | null };
          await svc.setChatNsfwOverride(ctx.params.chatId, override, auth,);
          return jsonResponse(SuccessResponse,);
        } catch (error: unknown) {
          return jsonError(error instanceof Error ? error.message : String(error,), 500,);
        }
      }, {
        params: t.Object({ chatId: t.String(), },),
        body: nsfwOverrideBody,
        response: { 200: SuccessResponse, 500: ErrorResponse, },
      },)
      .put(`${prefix}/nsfw/moderation/world/:worldId`, async (ctx: any,) => {
        const auth = requireModerationAction(ctx,);
        if (typeof auth !== "string") { return auth; }
        try {
          const { override, } = ctx.body as { override: "enabled" | "disabled" | null };
          await svc.setWorldNsfwOverride(ctx.params.worldId, override, auth,);
          return jsonResponse(SuccessResponse,);
        } catch (error: unknown) {
          return jsonError(error instanceof Error ? error.message : String(error,), 500,);
        }
      }, {
        params: t.Object({ worldId: t.String(), },),
        body: nsfwOverrideBody,
        response: { 200: SuccessResponse, 500: ErrorResponse, },
      },)
  );
}

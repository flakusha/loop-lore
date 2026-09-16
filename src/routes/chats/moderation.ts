// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat moderation route — `POST /api/chats/:id/moderate`.
 *
 * Single discriminated endpoint covering ban / kick / mute / flag-nsfw /
 * flag-tox. Each variant delegates to the matching primitive in
 * `src/chat/moderation.ts` (`applyBan`, `applyKick`, `applyMute`,
 * `applyFlag`). Authority is delegated to the existing
 * `checkChatSettingsAccess` helper — admin / chat owner / creator
 * passes; plain member / observer / guest / stranger is rejected.
 *
 * Audit row is written inside the primitive's transaction and surfaced
 * as `{ ok: true, auditEntryId }` so the client can deep-link to the
 * compliance trail.
 */
import { Elysia, t, } from "elysia";
import {
  applyBan,
  applyFlag,
  applyKick,
  applyMute,
} from "../../chat/moderation";
import { checkChatSettingsAccess, } from "../../chat/service";
import {
  badRequestResponse,
  forbiddenResponse,
  HttpStatus,
  jsonError,
  jsonResponse,
  requireUserId,
  unauthorizedResponse,
} from "../http-utils";
import type { HandlerOpts, } from "./types";

/**
 * Body schema — discriminated union over the action kinds.
 *
 * Duration is optional for `mute` (defaults to 1h server-side) and for
 * `ban` (null = indefinite, non-null = expiry timestamp). `content`
 * is optional for `flag-nsfw` / `flag-tox` and is forwarded to the
 * moderation hook when present.
 */
const ChatModerateBody = t.Union([
  t.Object({
    action: t.Literal("ban",),
    targetActorId: t.String({ minLength: 1, },),
    reason: t.Optional(t.String({ maxLength: 500, },),),
    durationMs: t.Optional(t.Number({ minimum: 0, },),),
  },),
  t.Object({
    action: t.Literal("kick",),
    targetActorId: t.String({ minLength: 1, },),
    reason: t.Optional(t.String({ maxLength: 500, },),),
  },),
  t.Object({
    action: t.Literal("mute",),
    targetActorId: t.String({ minLength: 1, },),
    reason: t.Optional(t.String({ maxLength: 500, },),),
    durationMs: t.Optional(t.Number({ minimum: 0, },),),
  },),
  t.Object({
    action: t.Literal("flag-nsfw",),
    targetActorId: t.String({ minLength: 1, },),
    reason: t.Optional(t.String({ maxLength: 500, },),),
    content: t.Optional(t.String({ maxLength: 50_000, },),),
  },),
  t.Object({
    action: t.Literal("flag-tox",),
    targetActorId: t.String({ minLength: 1, },),
    reason: t.Optional(t.String({ maxLength: 500, },),),
    content: t.Optional(t.String({ maxLength: 50_000, },),),
  },),
],);

/**
 * @param opts - Shared route options.
 * @param prefix - Mount prefix; defaults to `/api` so the route is
 *   `/api/chats/:id/moderate` — matching the v1 chats subplugin shape.
 */
export function moderationRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "chats-moderation", },)
    .post(
      `${prefix}/chats/:id/moderate`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const userRole = ctx.userRole as string | null;
        const chatId = (ctx.params as { id: string }).id;
        const body = ctx.body as typeof ChatModerateBody.static;

        // Authority: delegate to existing chat-settings access guard
        // (admin / chat owner / creator passes; plain member / observer
        // / guest / stranger is forbidden). This reuses
        // `src/middleware/permissions.ts` semantics without reimplementing
        // the role-resolution / handle-cache logic.
        const access = await checkChatSettingsAccess(database, chatId, userId, userRole,);
        if (!access.ok) {
          return userRole
            ? forbiddenResponse(access.error.message,)
            : unauthorizedResponse();
        }

        const sharedOpts = {
          chatId,
          targetActorId: body.targetActorId,
          byActorId: userId,
          scope: "chat" as const,
          reason: body.reason,
          kind: body.action,
          ...("durationMs" in body && body.durationMs !== undefined
            ? { durationMs: body.durationMs, }
            : {}),
        };

        try {
          switch (body.action) {
            case "ban": {
              const result = await applyBan(database, sharedOpts,);
              if (!result.ok) { return badRequestResponse(result.reason ?? "ban rejected",); }
              return jsonResponse(result,);
            }
            case "kick": {
              const result = await applyKick(database, sharedOpts,);
              if (!result.ok) { return badRequestResponse(result.reason ?? "kick rejected",); }
              return jsonResponse(result,);
            }
            case "mute": {
              const result = await applyMute(database, sharedOpts,);
              if (!result.ok) { return badRequestResponse(result.reason ?? "mute rejected",); }
              return jsonResponse(result,);
            }
            case "flag-nsfw": {
              const result = await applyFlag(database, sharedOpts, body.content,);
              if (!result.ok) { return badRequestResponse(result.reason ?? "flag rejected",); }
              return jsonResponse(result,);
            }
            case "flag-tox": {
              const result = await applyFlag(database, sharedOpts, body.content,);
              if (!result.ok) { return badRequestResponse(result.reason ?? "flag rejected",); }
              return jsonResponse(result,);
            }
          }
        } catch (err) {
          return jsonError(
            err instanceof Error ? err.message : "Moderation action failed",
            HttpStatus.InternalServerError,
            "moderation_error" as never,
          );
        }
      },
      { body: ChatModerateBody, },
    );
}

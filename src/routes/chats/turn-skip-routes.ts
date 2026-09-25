// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { recordTurnSkip, } from "../../chat/service/crud/turn-skip";
import { isLlmGenerationConfigured, triggerAutoGeneration, } from "../../generation/auto-gen";
import { createRateLimiter, rateLimitHeaders, } from "../../middleware/rate-limit";
import { ChatIdParams, TurnSkipBody, } from "../../validation/schemas";
import {
  HttpStatus,
  jsonError,
  jsonResponse,
  requireUserId,
} from "../http-utils";
import type { HandlerOpts, } from "./types";

/** Per-user + per-chat skip budget: 10 events / minute. */
const turnSkipLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 10, },);

/**
 * Mount POST /api/chats/:id/turn-skip on a parent Elysia app.
 *
 * Records the skip event (access + participant + interlock enforced in the
 * service layer) and, for mode=advance with generation configured, cues one
 * budgeted ambient beat via the existing auto-generation pipeline
 * (fire-and-forget, same convention as message reply).
 * @param opts
 * @param prefix
 */
export function turnSkipRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, config, } = opts;
  return (
    new Elysia({ name: "chats-turn-skip", },)
      .post(
        `${prefix}/chats/:id/turn-skip`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;
          const body = ctx.body as { mode: "hold" | "advance"; reason?: string };

          const limit = turnSkipLimiter.consume(`${userId}:${id}`,);
          if (!limit.allowed) {
            return new Response(null, { status: HttpStatus.TooManyRequests, headers: rateLimitHeaders(limit,), },);
          }

          const result = await recordTurnSkip(database, {
            chatId: id,
            actorId: userId,
            mode: body.mode,
            reason: body.reason ?? null,
            userId,
            userRole,
          },);
          if (!result.ok) {
            const status = result.code === "not_found"
              ? HttpStatus.NotFound
              : result.code === "refused_beat"
              ? HttpStatus.Conflict
              : HttpStatus.Forbidden;
            return jsonError(result.message, status, result.code as never,);
          }

          if (body.mode === "advance" && isLlmGenerationConfigured(config,)) {
            void triggerAutoGeneration({
              database,
              config,
              chatId: id,
              parentMessageId: result.messageId,
              userId,
            },);
          }
          return jsonResponse({ ok: true, messageId: result.messageId, mode: result.mode, deduped: result.deduped, },);
        },
        { body: TurnSkipBody, params: ChatIdParams, },
      )
  );
}

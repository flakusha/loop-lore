// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { recordTurnSkip, } from "../../chat/service/crud/turn-skip";
import { isLlmGenerationConfigured, triggerAutoGeneration, } from "../../generation/auto-gen";
import { getLogger, type Logger, } from "../../logger";
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

/** Logger bound to the chats module namespace. */
function log(): Logger {
  return getLogger().child({ module: "chats", },);
}

/**
 * Mount POST /api/chats/:id/turn-skip on a parent Elysia app.
 *
 * Records the skip event (access + participant + interlock enforced in the
 * service layer) and, for mode=advance with generation configured, cues one
 * budgeted ambient beat via the existing auto-generation pipeline
 * (fire-and-forget, same convention as message reply).
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { chats: { ":id": { "turn-skip": { ...; }; }; }; }; }, { ...; }, { ...; }>}
 */
export function turnSkipRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, config, } = opts;
  // Test seams, defaulting to the real auto-generation hub. Injected rather than
  // `mock.module`d: Bun's module registry is process-global with no unmock, so a
  // module-level stub also served every later file importing the same hub —
  // src/routes/messages/reply.ts, where a forced-true isLlmGenerationConfigured
  // made it take the generation branch and skip the assistant reply entirely.
  const llmConfigured = opts.isLlmGenerationConfigured ?? isLlmGenerationConfigured;
  const trigger = opts.triggerAutoGeneration ?? triggerAutoGeneration;
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

          // A deduped advance replays a stored row — its generation beat
          // already fired on the original request; don't cue a second one.
          if (body.mode === "advance" && !result.deduped && llmConfigured(config,)) {
            void trigger({
              database,
              config,
              chatId: id,
              parentMessageId: result.messageId,
              userId,
            },).catch((error: unknown,) => {
              // Fire-and-forget: surface failures via the structured logger
              // instead of emitting an unhandled-rejection warning at runtime.
              log().error(`triggerAutoGeneration failed: ${String(error,)}`, undefined, { chatId: id, },);
            },);
          }
          return jsonResponse({ ok: true, messageId: result.messageId, mode: result.mode, deduped: result.deduped, },);
        },
        { body: TurnSkipBody, params: ChatIdParams, },
      )
  );
}

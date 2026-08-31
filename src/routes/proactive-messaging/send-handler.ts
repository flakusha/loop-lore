// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `POST /send` handler for proactive messaging.
 *
 * Extracted from `index.ts` so the route registration file stays focused
 * on wiring Elysia handlers. This module owns the only endpoint that has
 * non-trivial orchestration: timing check → in-thread anchor → auto-gen
 * trigger → notification → recordSent.
 */
import type { Context, } from "elysia";
import { ProactiveMessagingService, } from "../../chat/proactive";
import type { ProactiveConfigInput, } from "../../chat/proactive/types";
import { NotificationType, } from "../../db/enums-core";
import { triggerAutoGeneration, } from "../../generation/auto-gen";
import { NotificationService, } from "../../notifications/service";
import { HttpStatus, jsonError, jsonResponse, } from "../http-utils";
import type { Ctx, } from "./auth";
import { authorizeProactiveTarget, } from "./auth";
import { logErr, } from "./schemas";
import type { ProactiveRouteOpts, } from "./schemas";

/**
 * Handle `POST /api/proactive-messaging/send`.
 *
 * Returns 409 when `checkShouldMessage` says it's not time yet (so the
 * client can react differently from a hard error). Returns 200 with
 * `{ triggered: true }` after the auto-gen + notification fan-out.
 * @param opts
 * @param ctx
 */
export async function sendProactiveHandler(
  opts: ProactiveRouteOpts,
  ctx: Context,
): Promise<Response> {
  const { database, config, } = opts;
  const { chatId, actorId, } = ctx.query as { chatId: string; actorId: string };

  const auth = await authorizeProactiveTarget(database, ctx as unknown as Ctx, chatId, actorId,);
  if (typeof auth !== "string") { return auth; }
  const userId = auth;

  const svc = () => new ProactiveMessagingService(database,);
  try {
    const result = await svc().checkShouldMessage(chatId, actorId,);
    if (!result.shouldMessage) {
      return jsonError({
        message: result.reason,
        status: HttpStatus.Conflict,
      },);
    }

    // Anchor the proactive message in-thread to the most recent message so
    // the character's check-in generates as a normal continuation.
    const lastMsg = await database
      .selectFrom("messages",)
      .select("id",)
      .where("chat_id", "=", chatId,)
      .orderBy("created_at", "desc",)
      .limit(1,)
      .executeTakeFirst();

    await triggerAutoGeneration({
      database,
      config,
      chatId,
      parentMessageId: lastMsg?.id ?? null,
      userId,
      _cascadeActorId: actorId,
      requestId: ctx.request.headers.get("x-request-id",) ?? undefined,
    },);

    await svc().recordSent(chatId, actorId,);

    // Notify the user a character reached out — surfaces via the existing
    // notification SSE + center (email/push when user has them enabled).
    new NotificationService(database,).emit({
      userId,
      type: NotificationType.System,
      title: "Character reached out",
      body: "A character messaged you while you were away.",
      link: `/views/chat?chatid=${encodeURIComponent(chatId,)}`,
      data: { chatId, actorId, },
    },);

    return jsonResponse({ triggered: true, },);
  } catch (error) {
    logErr("Failed to send proactive message", error,);
    return jsonError("Internal server error", 500,);
  }
}

// Suppress unused-import lint for the ProactiveConfigInput type re-export
// (it is imported transitively by callers via ProactiveRouteOpts callers).
export type { ProactiveConfigInput, };

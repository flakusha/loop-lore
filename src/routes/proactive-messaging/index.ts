// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Proactive Messaging Routes
 *
 * CRUD + check/trigger endpoints for per-chat proactive messaging config.
 * See .plan/tickets/TASK-proactive-messaging.md
 */
import { Elysia, } from "elysia";
import { ProactiveMessagingService, } from "../../chat/proactive";
import type { ProactiveConfigInput, } from "../../chat/proactive/types";
import { NotificationType, } from "../../db/enums-core";
import { triggerAutoGeneration, } from "../../generation/auto-gen";
import { NotificationService, } from "../../notifications/service";
import { HttpStatus, jsonError, jsonResponse, requireUserId, } from "../http-utils";
import { chatActorQuery, chatQuery, configBody, logErr, R, } from "./schemas";
import type { ProactiveRouteOpts, } from "./schemas";

export function proactiveMessagingRoutes(opts: ProactiveRouteOpts,) {
  const svc = () => new ProactiveMessagingService(opts.database,);
  const { database, config, } = opts;

  return new Elysia({ name: "proactive-messaging", },)
    // ── Get config for chat+actor ────────────────────────
    .get(`${R}/config`, async (ctx: any,) => {
      const userId = await requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const { chatId, actorId, } = ctx.query as { chatId: string; actorId: string };
      try {
        const config = await svc().getConfig(chatId, actorId,);
        return jsonResponse(config,);
      } catch (error) {
        logErr("Failed to get proactive config", error,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      query: chatActorQuery,
      detail: {
        summary: "Get proactive messaging config",
        description: "Get proactive messaging configuration for a chat+actor pair.",
        tags: ["Proactive Messaging",],
      },
    },)
    // ── List configs for chat ─────────────────────────────
    .get(`${R}/configs`, async (ctx: any,) => {
      const userId = await requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const { chatId, } = ctx.query as { chatId: string };
      try {
        const configs = await svc().getChatConfigs(chatId,);
        return jsonResponse(configs,);
      } catch (error) {
        logErr("Failed to list proactive configs", error,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      query: chatQuery,
      detail: {
        summary: "List proactive messaging configs",
        description: "List all proactive messaging configurations for a chat.",
        tags: ["Proactive Messaging",],
      },
    },)
    // ── Create/update config ──────────────────────────────
    .put(`${R}/config`, async (ctx: any,) => {
      const userId = await requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const { chatId, actorId, } = ctx.query as { chatId: string; actorId: string };
      const body = ctx.body as ProactiveConfigInput;
      try {
        const config = await svc().upsertConfig(chatId, actorId, body,);
        return jsonResponse(config,);
      } catch (error) {
        logErr("Failed to upsert proactive config", error,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      query: chatActorQuery,
      body: configBody,
      detail: {
        summary: "Create or update proactive messaging config",
        description: "Set proactive messaging configuration for a chat+actor pair.",
        tags: ["Proactive Messaging",],
      },
    },)
    // ── Check if should message now ───────────────────────
    .get(`${R}/check`, async (ctx: any,) => {
      const userId = await requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const { chatId, actorId, } = ctx.query as { chatId: string; actorId: string };
      try {
        const result = await svc().checkShouldMessage(chatId, actorId,);
        return jsonResponse(result,);
      } catch (error) {
        logErr("Failed to check proactive messaging", error,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      query: chatActorQuery,
      detail: {
        summary: "Check if proactive message should be sent",
        description: "Evaluate timing, quiet hours, and backoff to determine if a proactive message is due.",
        tags: ["Proactive Messaging",],
      },
    },)
    // ── Record message sent ───────────────────────────────
    .post(`${R}/record-sent`, async (ctx: any,) => {
      const userId = await requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const { chatId, actorId, } = ctx.query as { chatId: string; actorId: string };
      try {
        await svc().recordSent(chatId, actorId,);
        return jsonResponse({ ok: true, },);
      } catch (error) {
        logErr("Failed to record proactive message sent", error,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      query: chatActorQuery,
      detail: {
        summary: "Record proactive message sent",
        description: "Mark that a proactive message was sent (resets backoff counter).",
        tags: ["Proactive Messaging",],
      },
    },)
    // ── Reset backoff (user responded) ────────────────────
    .post(`${R}/reset-backoff`, async (ctx: any,) => {
      const userId = await requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const { chatId, actorId, } = ctx.query as { chatId: string; actorId: string };
      try {
        await svc().resetBackoff(chatId, actorId,);
        return jsonResponse({ ok: true, },);
      } catch (error) {
        logErr("Failed to reset proactive backoff", error,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      query: chatActorQuery,
      detail: {
        summary: "Reset proactive messaging backoff",
        description: "Reset anti-spam backoff counter (call when user responds).",
        tags: ["Proactive Messaging",],
      },
    },)
    // ── Send a proactive message (trigger generation) ──────
    .post(`${R}/send`, async (ctx: any,) => {
      const userId = await requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const { chatId, actorId, } = ctx.query as { chatId: string; actorId: string };
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
    }, {
      query: chatActorQuery,
      detail: {
        summary: "Send a proactive message",
        description: "Trigger a proactive message when one is due (respecting quiet hours, frequency, and backoff).",
        tags: ["Proactive Messaging",],
      },
    },)
    // ── Increment backoff (user did not respond) ─────────────
    .post(`${R}/backoff`, async (ctx: any,) => {
      const userId = await requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const { chatId, actorId, } = ctx.query as { chatId: string; actorId: string };
      try {
        await svc().incrementBackoff(chatId, actorId,);
        return jsonResponse({ ok: true, },);
      } catch (error) {
        logErr("Failed to increment proactive backoff", error,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      query: chatActorQuery,
      detail: {
        summary: "Increment proactive messaging backoff",
        description: "Increment the anti-spam backoff counter (call when the user has not responded).",
        tags: ["Proactive Messaging",],
      },
    },)
    // ── Delete config ─────────────────────────────────────
    .delete(`${R}/config`, async (ctx: any,) => {
      const userId = await requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const { chatId, actorId, } = ctx.query as { chatId: string; actorId: string };
      try {
        const deleted = await svc().deleteConfig(chatId, actorId,);
        return jsonResponse({ deleted, },);
      } catch (error) {
        logErr("Failed to delete proactive config", error,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      query: chatActorQuery,
      detail: {
        summary: "Delete proactive messaging config",
        description: "Remove proactive messaging configuration for a chat+actor pair.",
        tags: ["Proactive Messaging",],
      },
    },);
}

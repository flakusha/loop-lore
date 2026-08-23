// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Proactive Messaging Routes
 *
 * CRUD + check/trigger endpoints for per-chat proactive messaging config.
 * See .plan/tickets/TASK-proactive-messaging.md
 *
 * Authorization:
 *   Every endpoint validates two things before touching the service layer:
 *     1. The authenticated user owns the `actorId` (or has `admin.character`).
 *     2. The authenticated user has access to `chatId` (creator, participant,
 *        or `admin.chat`). Both gates use the existing helpers
 *        `checkActorOwnership` / `checkChatAccess`; `actorId` is therefore
 *        scoped to the requester — a participant cannot target another
 *        user's actor via query manipulation.
 */
import { Elysia, type Context, } from "elysia";
import type { Kysely, } from "kysely";
import { checkChatAccess, } from "../../chat/service";
import { ProactiveMessagingService, } from "../../chat/proactive";
import type { ProactiveConfigInput, } from "../../chat/proactive/types";
import type { DB, } from "../../db/schema";
import { checkActorOwnership, } from "../actor-auth";
import { NotificationType, } from "../../db/enums-core";
import { triggerAutoGeneration, } from "../../generation/auto-gen";
import { NotificationService, } from "../../notifications/service";
import {
  HttpStatus,
  jsonError,
  jsonResponse,
  requireUserId,
} from "../http-utils";
import { chatActorQuery, chatQuery, configBody, logErr, R, } from "./schemas";
import type { ProactiveRouteOpts, } from "./schemas";

/**
 * Shape of the auth-guard context that the global elysia-app derive populates
 * (`userId`, `userRole`). Tests inject the same shape via `.derive(...)`.
 * Defined as a named interface so route handlers stay narrowly typed without
 * the `any` banned-pattern.
 */
interface AuthContext {
  userId: string | null;
  userRole: string | null;
}

/** Route handler context — augments Elysia's auto context with auth fields. */
type Ctx = Context & AuthContext;

/**
 * Verify the authenticated user owns `actorId` AND has access to `chatId`.
 * Returns the userId on success; on failure returns a Response that the
 * caller should return as-is (401 / 404).
 *
 * Both checks fail-closed with `notFound` (404) to avoid leaking which
 * dimension of the authorization failed. Used in 7 of 8 endpoints (the
 * `configs` list endpoint scopes only by chat and so uses
 * `checkChatAccess` inline).
 *
 * @param database - Kysely handle for the authorization checks
 * @param ctx - Elysia handler context (auth fields populated by global derive)
 * @param chatId - Chat the user must have access to
 * @param actorId - Actor the user must own (target of the proactive config)
 * @returns The authenticated userId, or a Response to short-circuit
 */
async function authorizeProactiveTarget(
  database: Kysely<DB>,
  ctx: Ctx,
  chatId: string,
  actorId: string,
): Promise<string | Response> {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }
  const userRole = ctx.userRole;

  if (!(await checkActorOwnership(database, actorId, userId, userRole,))) {
    return jsonError({
      message: "Actor not found",
      status: HttpStatus.NotFound,
    },);
  }

  const access = await checkChatAccess(database, chatId, userId, userRole,);
  if (!access.ok) {
    return jsonError({
      message: "Chat not found",
      status: HttpStatus.NotFound,
    },);
  }

  return userId;
}

export function proactiveMessagingRoutes(opts: ProactiveRouteOpts,) {
  const svc = () => new ProactiveMessagingService(opts.database,);
  const { database, config, } = opts;

  return new Elysia({ name: "proactive-messaging", },)
    // ── Get config for chat+actor ────────────────────────
    .get(`${R}/config`, async (ctx,) => {
      const { chatId, actorId, } = ctx.query;
      const auth = await authorizeProactiveTarget(database, ctx as unknown as Ctx, chatId, actorId,);
      if (typeof auth !== "string") { return auth; }
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
    .get(`${R}/configs`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const { chatId, } = ctx.query;
      const access = await checkChatAccess(database, chatId, userId, (ctx as unknown as Ctx).userRole,);
      if (!access.ok) {
        return jsonError({ message: "Chat not found", status: HttpStatus.NotFound, },);
      }
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
    .put(`${R}/config`, async (ctx,) => {
      const { chatId, actorId, } = ctx.query;
      const auth = await authorizeProactiveTarget(database, ctx as unknown as Ctx, chatId, actorId,);
      if (typeof auth !== "string") { return auth; }
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
    .get(`${R}/check`, async (ctx,) => {
      const { chatId, actorId, } = ctx.query;
      const auth = await authorizeProactiveTarget(database, ctx as unknown as Ctx, chatId, actorId,);
      if (typeof auth !== "string") { return auth; }
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
    .post(`${R}/record-sent`, async (ctx,) => {
      const { chatId, actorId, } = ctx.query;
      const auth = await authorizeProactiveTarget(database, ctx as unknown as Ctx, chatId, actorId,);
      if (typeof auth !== "string") { return auth; }
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
    .post(`${R}/reset-backoff`, async (ctx,) => {
      const { chatId, actorId, } = ctx.query;
      const auth = await authorizeProactiveTarget(database, ctx as unknown as Ctx, chatId, actorId,);
      if (typeof auth !== "string") { return auth; }
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
    .post(`${R}/send`, async (ctx,) => {
      const { chatId, actorId, } = ctx.query;
      const auth = await authorizeProactiveTarget(database, ctx as unknown as Ctx, chatId, actorId,);
      if (typeof auth !== "string") { return auth; }
      const userId = auth;
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
    .post(`${R}/backoff`, async (ctx,) => {
      const { chatId, actorId, } = ctx.query;
      const auth = await authorizeProactiveTarget(database, ctx as unknown as Ctx, chatId, actorId,);
      if (typeof auth !== "string") { return auth; }
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
    .delete(`${R}/config`, async (ctx,) => {
      const { chatId, actorId, } = ctx.query;
      const auth = await authorizeProactiveTarget(database, ctx as unknown as Ctx, chatId, actorId,);
      if (typeof auth !== "string") { return auth; }
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

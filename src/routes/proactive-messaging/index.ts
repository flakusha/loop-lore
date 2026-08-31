// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Proactive Messaging Routes — registration only.
 *
 * The auth helper lives in `./auth.ts` and the `/send` orchestration
 * (the only endpoint with non-trivial body) lives in
 * `./send-handler.ts`. This file owns the Elysia wiring for the
 * simpler CRUD/check/record endpoints.
 *
 * See .plan/tickets/TASK-proactive-messaging.md.
 */
import { type Context, Elysia, } from "elysia";
import { ProactiveMessagingService, } from "../../chat/proactive";
import type { ProactiveConfigInput, } from "../../chat/proactive/types";
import { checkChatAccess, } from "../../chat/service";
import { HttpStatus, jsonError, jsonResponse, requireUserId, } from "../http-utils";
import type { Ctx, } from "./auth";
import { authorizeProactiveTarget, } from "./auth";
import { chatActorQuery, chatQuery, configBody, logErr, R, } from "./schemas";
import type { ProactiveRouteOpts, } from "./schemas";
import { sendProactiveHandler, } from "./send-handler";

/**
 * @param opts
 */
export function proactiveMessagingRoutes(opts: ProactiveRouteOpts,) {
  const svc = () => new ProactiveMessagingService(opts.database,);
  const { database, } = opts;

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
    // ── Send a proactive message (orchestration in send-handler.ts) ──
    .post(`${R}/send`, async (ctx: Context,) => sendProactiveHandler(opts, ctx,), {
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

/**
 * Proactive Messaging Routes
 *
 * CRUD + check/trigger endpoints for per-chat proactive messaging config.
 * See .plan/tickets/TASK-proactive-messaging.md
 */
import { Elysia, t, } from "elysia";
import { ProactiveMessagingService, } from "../../chat/proactive";
import type { ProactiveConfigInput, } from "../../chat/proactive/types";
import type { HandlerOpts, } from "../actor-auth";
import { jsonError, jsonResponse, requireUserId, } from "../http-utils";

const R = "/api/proactive-messaging";

const frequencyEnum = t.Union([
  t.Literal("very_frequent",),
  t.Literal("frequent",),
  t.Literal("normal",),
  t.Literal("infrequent",),
],);

const nullableString = t.Union([t.String(), t.Null(),],);
const stringUnknownRecord = t.Record(t.String(), t.Unknown(),);

const configBody = t.Object({
  frequency: t.Optional(frequencyEnum,),
  quietHoursStart: t.Optional(nullableString,),
  quietHoursEnd: t.Optional(nullableString,),
  enabled: t.Optional(t.Boolean(),),
  configJson: t.Optional(stringUnknownRecord,),
},);

const chatQuery = t.Object({ chatId: t.String(), },);
const chatActorQuery = t.Object({ chatId: t.String(), actorId: t.String(), },);

export function proactiveMessagingRoutes(opts: HandlerOpts,) {
  const svc = () => new ProactiveMessagingService(opts.database,);

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

function logErr(msg: string, err: unknown,): void {
  console.error(`[proactive-messaging] ${msg}`, err,);
}

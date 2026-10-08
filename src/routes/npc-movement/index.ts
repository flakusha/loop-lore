// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NPC Movement Indicator Routes
 *
 * HTTP endpoints for querying and storing movement events in chat.
 */
import { Elysia, t, } from "elysia";
import { NpcMovementIndicatorService, } from "../../chat/npc-movement";
import { checkChatAccess, } from "../../chat/service";
import { getLogger, type Logger, } from "../../logger";
import type { HandlerOpts, } from "../actor-auth";
import { jsonError, jsonResponse, requireUserId, } from "../http-utils";

const R_SUFFIX = "/npc-movement";

const movementEventSchema = t.Object({
  actorId: t.String(),
  fromLocationId: t.String(),
  toLocationId: t.String(),
  pattern: t.String(),
  timestamp: t.String(),
},);

const storeBody = t.Object({
  messageId: t.String(),
  events: t.Array(movementEventSchema,),
},);

const querySchema = t.Object({
  chatId: t.String(),
  actorId: t.Optional(t.String(),),
  since: t.Optional(t.String(),),
  limit: t.Optional(t.Number(),),
},);

/**
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { events: { post: { ...; }; }; }; } & { ...; } & { ...; }, { ...; }, { ...; }>}
 */
export function npcMovementRoutes(opts: HandlerOpts, prefix = "/api",) {
  const svc = () => new NpcMovementIndicatorService(opts.database,);
  const R = `${prefix}${R_SUFFIX}`;
  return new Elysia({ name: "npc-movement", },)
    .post(`${R}/events`, async (ctx: any,) => {
      const userId = await requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }

      const body = ctx.body as { messageId: string; events: MovementEvent[] };

      try {
        await svc().storeMovementEvents(body.messageId, body.events,);
        return jsonResponse({ success: true, },);
      } catch (error) {
        logErr("Failed to store movement events", error,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      body: storeBody,
      detail: {
        summary: "Store movement events in message metadata",
        description: "Attach NPC movement events to an existing message.",
      },
    },)
    // ── Get movement events ────────────────────────────────
    .get(`${R}/events`, async (ctx: any,) => {
      const userId = await requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }

      const query = ctx.query as { chatId: string; actorId?: string; since?: string; limit?: number };

      // Verify chat access
      const access = await checkChatAccess(opts.database, query.chatId, userId, ctx.userRole as string | null,);
      if (!access.ok) {
        return jsonError("Chat not found", 404,);
      }

      try {
        const events = await svc().getMovementEvents(query,);
        return jsonResponse(events,);
      } catch (error) {
        logErr("Failed to get movement events", error,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      query: querySchema,
      detail: {
        summary: "Get movement events for a chat",
        description: "Retrieve NPC movement events, optionally filtered by actor or time.",
      },
    },)
    // ── Get recent movements ───────────────────────────────
    .get(`${R}/recent/:chatId`, async (ctx: any,) => {
      const userId = await requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }

      const { chatId, } = ctx.params as { chatId: string };
      const query = ctx.query as { limit?: number };

      // Verify chat access
      const access = await checkChatAccess(opts.database, chatId, userId, ctx.userRole as string | null,);
      if (!access.ok) {
        return jsonError("Chat not found", 404,);
      }

      try {
        const events = await svc().getRecentMovements(chatId, query.limit,);
        return jsonResponse(events,);
      } catch (error) {
        logErr("Failed to get recent movements", error,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      detail: {
        summary: "Get recent movement events for display",
        description: "Retrieve recent NPC movement events for chat UI display.",
      },
    },);
}

// Type alias for the schema
interface MovementEvent {
  actorId: string;
  fromLocationId: string;
  toLocationId: string;
  pattern: string;
  timestamp: string;
}

// Helper for logging errors
/**
 * @param msg
 * @param err
 */
function logErr(msg: string, err: unknown,) {
  log()?.error(msg, err instanceof Error ? err : new Error(String(err,),),);
}

/**
 * Lazily resolve the module logger (null before logger init).
 * @returns the child logger, or null when no root logger exists yet
 */
function log(): Logger | null {
  try {
    return getLogger().child({ module: "npc-movement", },);
  } catch {
    return null;
  }
}

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Game State Routes
 *
 *   GET /api/chats/:id/game-state   — latest persisted game state + diff
 *   GET /api/chats/:id/game-states  — persisted game-state history
 *
 * Serves the 2D game canvas: the spatial snapshot extracted from
 * ```game-state fenced blocks, plus a movement diff against the
 * previous persisted state.
 */

import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import { checkChatAccess, } from "../chat/service";
import type { DB, } from "../db/schema";
import { getGameStateHistory, getLatestGameState, } from "../game-state";
import { notFound, } from "../validation/middleware";
import { ErrorResponse, } from "../validation/schemas";
import { GameStateAnalysisSchema, GameStateSchema, } from "../validation/schemas/world-state";
import { jsonResponse, requireUserId, } from "./http-utils";

interface HandleOpts {
  database: Kysely<DB>;
}

const GameStateRowSchema = t.Object({
  id: t.String(),
  messageId: t.Union([t.String(), t.Null(),],),
  createdAt: t.String(),
},);

interface RouteCtx {
  params: { id: string };
  request: Request;
  userRole?: string | null;
}

/**
 * Build the Elysia game-state routes.
 * @param opts - db handle for game-state queries
 * @param prefix - route prefix (default `/api`)
 * @returns Elysia instance with the two game-state GET routes
 */
export function gameStateRoutes(opts: HandleOpts, prefix = "/api",): Elysia {
  const { database, } = opts;

  return (
    new Elysia({ name: "game-state", },)
      /**
       * GET /api/chats/:id/game-state
       *
       * Latest persisted game state for the chat with its diff against
       * the previous persisted state.
       */
      .get(
        `${prefix}/chats/:id/game-state`,
        async (ctx: RouteCtx,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }

          const chatId = ctx.params.id;

          const access = await checkChatAccess(database, chatId, userId, ctx.userRole ?? null,);
          if (!access.ok) { return notFound("Chat not found",); }

          const latest = await getLatestGameState({ database, chatId, },);
          if (!latest) { return notFound("Game state not found",); }

          return jsonResponse({ data: latest, },);
        },
        {
          params: t.Object({ id: t.String(), },),
          response: {
            200: t.Object({
              data: t.Object({
                messageId: t.Union([t.String(), t.Null(),],),
                createdAt: t.String(),
                state: GameStateSchema,
                analysis: t.Union([GameStateAnalysisSchema, t.Null(),],),
              },),
            },),
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Get latest game state",
            description:
              "Latest persisted game state for the chat, with a movement diff against the previous persisted state. 404 when the chat does not exist, is not accessible, or has no persisted game state.",
            tags: ["Game State",],
          },
        },
      )
      /**
       * GET /api/chats/:id/game-states
       *
       * Persisted game-state history for the chat, newest first.
       * Query params: ?limit=20 (clamped to 1..100, default 20)
       */
      .get(
        `${prefix}/chats/:id/game-states`,
        async (ctx: RouteCtx,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }

          const chatId = ctx.params.id;

          const access = await checkChatAccess(database, chatId, userId, ctx.userRole ?? null,);
          if (!access.ok) { return notFound("Chat not found",); }

          const limitParam = new URL(ctx.request.url,).searchParams.get("limit",);
          const rawLimit = limitParam === null ? Number.NaN : Number(limitParam,);
          const limit = Number.isFinite(rawLimit,)
            ? Math.min(100, Math.max(1, Math.trunc(rawLimit,),),)
            : 20;

          const rows = await getGameStateHistory({ database, chatId, limit, },);
          return jsonResponse({ data: rows, },);
        },
        {
          params: t.Object({ id: t.String(), },),
          query: t.Object({ limit: t.Optional(t.Numeric(),), },),
          response: {
            200: t.Object({
              data: t.Array(GameStateRowSchema,),
            },),
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "List game states",
            description:
              "Persisted game-state history for the chat, newest first. `limit` is clamped to 1..100 and defaults to 20.",
            tags: ["Game State",],
          },
        },
      )
  );
}

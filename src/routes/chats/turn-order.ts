// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Group-chat turn-order route (C1 — chat-type matrix UI remainder).
 *
 * `GET /api/chats/:id/turn-order` returns a READ-ONLY snapshot of the current
 * turn order for the frontend indicator: the strategy, the current speaker
 * (most recent visible message actor), the strategy-selected next actor, and
 * the ordered participant list. Computed server-side via the pure `STRATEGY_MAP`
 * functions so the indicator cannot drift from `src/turning/turn-strategies.ts`.
 *
 * Deliberately a SEPARATE endpoint (not folded into the participants GET) so the
 * existing participants response shape — a bare array consumed by nine frontend
 * modules (mood, chat-settings, gm-guidance, story-state, ...) — is unchanged.
 */
import { Elysia, t, } from "elysia";
import { checkChatAccess, resolveGroupTurnOrder, } from "../../chat/service";
import { jsonResponse, notFoundResponse as notFound, requireUserId, } from "../http-utils";
import type { HandlerOpts, } from "./types";

/**
 * Turn-order routes — read-only group-chat orchestration view.
 * @param opts
 * @param prefix
 */
export function turnOrderRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "chats-turn-order", },)
      .get(
        `${prefix}/chats/:id/turn-order`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;

          const access = await checkChatAccess(database, id, userId, userRole,);
          if (!access.ok) { return notFound("Chat not found",); }

          const turnOrder = await resolveGroupTurnOrder(database, id,);
          return jsonResponse({ turnOrder, },);
        },
        { params: t.Object({ id: t.String({ minLength: 1, },), },), },
      )
  );
}

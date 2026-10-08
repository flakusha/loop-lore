// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { ErrorResponse, Id, } from "../../validation/schemas";
import { resolveActorAccess, } from "../actor-access";
import { jsonResponse, } from "../http-utils";
import { requireUserId, } from "../http-utils/responses";
import type { TradeRoutesOptions, } from "./shared";

/**
 * Trade history route — query past trades for a world, optionally
 * filtered by actor (owner-gated).
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { worlds: { ":worldId": { ...; }; }; }; }, { ...; }, { ...; }>}
 */
export function tradeHistoryRoutes(opts: TradeRoutesOptions, prefix = "/api",) {
  return (
    new Elysia({ name: "trade-history", },)
      // ── Trade History ───────────────────────────────────────
      .get(`${prefix}/worlds/:worldId/trade/history`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        // actorId is required, not optional: history is participant-scoped, so
        // omitting it would return every trade in the world to any caller.
        const denied = await resolveActorAccess(opts.database, ctx.query.actorId, userId,);
        if (denied) { return denied; }

        const history = await opts.svc().getTradeHistory(
          ctx.params.worldId,
          ctx.query.actorId,
          ctx.query.limit,
        );

        return jsonResponse({ history, },);
      }, {
        params: t.Object({ worldId: Id, },),
        query: t.Object({
          actorId: Id,
          limit: t.Optional(t.Integer({ minimum: 1, maximum: 200, },),),
        },),
        response: {
          200: t.Object({
            history: t.Array(
              t.Object({
                id: Id,
                worldId: Id,
                buyerActorId: Id,
                sellerActorId: Id,
                price: t.Integer(),
                currencyType: t.String(),
                itemsOffered: t.Array(t.String(),),
                itemsRequested: t.Array(t.String(),),
                tradeType: t.String(),
                createdAt: t.String(),
              },),
            ),
          },),
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Trade history",
          description: "Query trade history for an actor in a world. Participant-scoped.",
          tags: ["Trade",],
        },
      },)
  );
}

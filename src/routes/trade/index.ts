// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Trade Routes
 *
 * Currency + trade endpoints over `TradeService` (src/services/trade):
 *   GET  /api/worlds/:worldId/trade/balance?actorId=&currency=  — actor balance
 *   POST /api/worlds/:worldId/trade/execute                     — atomic two-sided trade
 *   POST /api/worlds/:worldId/trade/buy-from-npc|sell-to-npc     — player <-> NPC trades
 *   GET  /api/worlds/:worldId/trade/history                      — trade history
 *   POST /api/worlds/:worldId/trade/offers ...                   — trade offers
 *
 * Ownership is resolved via the actor's owner (actors.user_id) for the
 * calling user. The `execute` endpoint accepts explicit buyer/seller actor
 * ids; the caller must own at least one side of the trade.
 *
 * Barrel assembles the surface from domain sub-plugins (see ./shared,
 * ./npc, ./history, ./offers). Registration point/name (`trade`) is
 * preserved so the `register-plugins.ts` wiring is unchanged.
 */
import { Elysia, t, } from "elysia";
import type { Db, } from "../../db";
import { TradeService, } from "../../services/trade";
import { safeJsonStringify, } from "../../utils/safe-json";
import { ErrorResponse, Id, } from "../../validation/schemas";
import { resolveActorAccess, } from "../actor-access";
import { badRequestResponse, jsonResponse, } from "../http-utils";
import { requireUserId, } from "../http-utils/responses";
import { tradeHistoryRoutes, } from "./history";
import { npcTradeRoutes, } from "./npc";
import { tradeOfferRoutes, } from "./offers";
import { executeBody, executeResponse, } from "./shared";

/**
 * @param root0
 * @param root0.database
 * @param prefix
 */
export function tradeRoutes({ database, }: { database: Db }, prefix = "/api",): Elysia {
  const svc = () => new TradeService(database,);
  const opts = { database, svc, };
  return (
    new Elysia({ name: "trade", },)
      .get(`${prefix}/worlds/:worldId/trade/balance`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const actorId = ctx.query.actorId as string | undefined;
        if (!actorId) { return badRequestResponse("actorId query param required",); }
        const denied = await resolveActorAccess(database, actorId, userId,);
        if (denied) { return denied; }
        const balance = await svc().getBalance(actorId, ctx.params.worldId, ctx.query.currency ?? "gold",);
        return jsonResponse({ actorId, worldId: ctx.params.worldId, balance, },);
      }, {
        params: t.Object({ worldId: Id, },),
        query: t.Object({ actorId: Id, currency: t.Optional(t.String(),), },),
        response: {
          200: t.Object({ actorId: Id, worldId: Id, balance: t.Integer(), },),
          400: ErrorResponse,
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Actor currency balance",
          description: "Read an actor's currency balance in a world.",
          tags: ["Trade",],
        },
      },)
      .post(`${prefix}/worlds/:worldId/trade/execute`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const body = ctx.body as {
          buyerActorId: string;
          sellerActorId: string;
          buyerItems: never[];
          sellerItems: never[];
          price: number;
        };
        // The caller must control at least one side of the trade.
        const buyerDenied = await resolveActorAccess(database, body.buyerActorId, userId,);
        const sellerDenied = await resolveActorAccess(database, body.sellerActorId, userId,);
        if (buyerDenied && sellerDenied) { return sellerDenied; }
        const res = await svc().trade({
          worldId: ctx.params.worldId,
          buyerActorId: body.buyerActorId,
          sellerActorId: body.sellerActorId,
          buyerItems: body.buyerItems,
          sellerItems: body.sellerItems,
          price: body.price,
        },);
        if (!res.success) { return badRequestResponse(res.reason ?? "Trade failed",); }
        return jsonResponse({ ok: true, ...res, },);
      }, {
        params: t.Object({ worldId: Id, },),
        body: executeBody,
        response: {
          200: executeResponse,
          400: ErrorResponse,
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Execute trade",
          description: "Atomically exchange items + gold between two actors.",
          tags: ["Trade",],
        },
      },)
      .use(npcTradeRoutes(opts, prefix,),)
      .use(tradeHistoryRoutes(opts, prefix,),)
      .use(tradeOfferRoutes(opts, prefix,),)
      .onError(({ code, error, set, },) => {
        if (code === "NOT_FOUND") {
          set.status = 404;
          return { error: "Resource not found", };
        }
        if (code === "VALIDATION") {
          set.status = 400;
          const result = safeJsonStringify(error,);
          const serialized = result.ok ? result.value : "Validation error";
          const errorText = error instanceof Error ? error.message : (typeof error === "string" ? error : serialized);
          return { error: errorText, };
        }
      },)
  ) as unknown as Elysia;
}

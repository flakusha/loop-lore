// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import type { TradeLine, } from "../../services/trade";
import { ErrorResponse, Id, } from "../../validation/schemas";
import { badRequestResponse, jsonResponse, } from "../http-utils";
import { requireUserId, } from "../http-utils/responses";
import type { TradeRoutesOptions, } from "./shared";
import { executeResponse, tradeLineSchema, } from "./shared";
import { resolveActorAccess, } from "../actor-access";

/**
 * NPC trade routes — buy-from-NPC and sell-to-NPC, each a player-vs-NPC
 * transfer of items + gold. The caller must own the player side.
 * @param opts
 * @param prefix
 */
export function npcTradeRoutes(opts: TradeRoutesOptions, prefix = "/api",) {
  return (
    new Elysia({ name: "trade-npc", },)
      // ── NPC Buy (player buys from NPC) ──────────────────────
      .post(`${prefix}/worlds/:worldId/trade/buy-from-npc`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const body = ctx.body as {
          buyerActorId: string;
          npcActorId: string;
          sellerItems: TradeLine[];
          price: number;
        };
        const denied = await resolveActorAccess(opts.database, body.buyerActorId, userId,);
        if (denied) { return denied; }
        const res = await opts.svc().buyFromNpc({
          worldId: ctx.params.worldId,
          buyerActorId: body.buyerActorId,
          npcActorId: body.npcActorId,
          sellerItems: body.sellerItems,
          price: body.price,
        },);
        if (!res.success) { return badRequestResponse(res.reason ?? "Trade failed",); }
        return jsonResponse({ ok: true, ...res, },);
      }, {
        params: t.Object({ worldId: Id, },),
        body: t.Object({
          buyerActorId: Id,
          npcActorId: Id,
          sellerItems: t.Array(tradeLineSchema,),
          price: t.Integer({ minimum: 0, },),
        },),
        response: {
          200: executeResponse,
          400: ErrorResponse,
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Buy from NPC",
          description: "Player buys items from an NPC. Items owned by the NPC transfer to the player.",
          tags: ["Trade",],
        },
      },)
      // ── NPC Sell (player sells to NPC) ──────────────────────
      .post(`${prefix}/worlds/:worldId/trade/sell-to-npc`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const body = ctx.body as {
          sellerActorId: string;
          npcActorId: string;
          buyerItems: TradeLine[];
          price: number;
        };
        const denied = await resolveActorAccess(opts.database, body.sellerActorId, userId,);
        if (denied) { return denied; }
        const res = await opts.svc().sellToNpc({
          worldId: ctx.params.worldId,
          sellerActorId: body.sellerActorId,
          npcActorId: body.npcActorId,
          buyerItems: body.buyerItems,
          price: body.price,
        },);
        if (!res.success) { return badRequestResponse(res.reason ?? "Trade failed",); }
        return jsonResponse({ ok: true, ...res, },);
      }, {
        params: t.Object({ worldId: Id, },),
        body: t.Object({
          sellerActorId: Id,
          npcActorId: Id,
          buyerItems: t.Array(tradeLineSchema,),
          price: t.Integer({ minimum: 0, },),
        },),
        response: {
          200: executeResponse,
          400: ErrorResponse,
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Sell to NPC",
          description: "Player sells items to an NPC. Items owned by the player transfer to the NPC.",
          tags: ["Trade",],
        },
      },)
  );
}

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import type { TradeLine, } from "../../services/trade";
import { ErrorResponse, Id, } from "../../validation/schemas";
import { badRequestResponse, jsonResponse, } from "../http-utils";
import { requireUserId, } from "../http-utils/responses";
import type { TradeRoutesOptions, } from "./shared";
import { executeResponse, resolveActorAccess, tradeLineSchema, } from "./shared";

/**
 * Trade offer routes — create, list, accept and cancel pending offers.
 * The buyer proposes items + gold; only the seller accepts, only the
 * creator cancels.
 */
export function tradeOfferRoutes(opts: TradeRoutesOptions, prefix = "/api",) {
  return (
    new Elysia({ name: "trade-offers", },)
      // ── Trade Offers ────────────────────────────────────────
      .post(`${prefix}/worlds/:worldId/trade/offers`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const body = ctx.body as {
          buyerActorId: string;
          sellerActorId: string;
          buyerItems: TradeLine[];
          price: number;
        };
        const denied = await resolveActorAccess(opts.database, body.buyerActorId, userId,);
        if (denied) { return denied; }
        const id = await opts.svc().createOffer({
          worldId: ctx.params.worldId,
          buyerActorId: body.buyerActorId,
          sellerActorId: body.sellerActorId,
          buyerItems: body.buyerItems,
          price: body.price,
        },);
        return jsonResponse({ ok: true, offerId: id, },);
      }, {
        params: t.Object({ worldId: Id, },),
        body: t.Object({
          buyerActorId: Id,
          sellerActorId: Id,
          buyerItems: t.Array(tradeLineSchema,),
          price: t.Integer({ minimum: 0, },),
        },),
        response: {
          200: t.Object({ ok: t.Boolean(), offerId: Id, },),
          400: ErrorResponse,
          401: ErrorResponse,
          403: ErrorResponse,
        },
        detail: {
          summary: "Create trade offer",
          description: "Create a pending trade offer. The buyer proposes items + gold to a seller.",
          tags: ["Trade",],
        },
      },)
      .get(`${prefix}/worlds/:worldId/trade/offers`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const actorId = ctx.query.actorId as string;
        if (!actorId) { return badRequestResponse("actorId query param required",); }
        const denied = await resolveActorAccess(opts.database, actorId, userId,);
        if (denied) { return denied; }
        const offers = await opts.svc().listOffers(ctx.params.worldId, actorId,);
        return jsonResponse({ offers, },);
      }, {
        params: t.Object({ worldId: Id, },),
        query: t.Object({ actorId: Id, },),
        response: {
          200: t.Object({
            offers: t.Array(
              t.Object({
                id: Id,
                buyerActorId: Id,
                sellerActorId: t.Union([Id, t.Null(),],),
                price: t.Integer(),
                items: t.Array(tradeLineSchema,),
                status: t.String(),
                deadline: t.Union([t.String(), t.Null(),],),
                createdAt: t.String(),
              },),
            ),
          },),
          401: ErrorResponse,
          403: ErrorResponse,
        },
        detail: {
          summary: "List trade offers",
          description: "List pending trade offers for an actor (as buyer or seller).",
          tags: ["Trade",],
        },
      },)
      .post(`${prefix}/worlds/:worldId/trade/offers/:offerId/accept`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const body = ctx.body as { sellerActorId: string };
        const denied = await resolveActorAccess(opts.database, body.sellerActorId, userId,);
        if (denied) { return denied; }
        const res = await opts.svc().acceptOffer(ctx.params.offerId, body.sellerActorId,);
        if (!res.success) { return badRequestResponse(res.reason ?? "Accept failed",); }
        return jsonResponse({ ok: true, ...res, },);
      }, {
        params: t.Object({ worldId: Id, offerId: Id, },),
        body: t.Object({ sellerActorId: Id, },),
        response: {
          200: executeResponse,
          400: ErrorResponse,
          401: ErrorResponse,
          403: ErrorResponse,
        },
        detail: {
          summary: "Accept trade offer",
          description: "Accept a pending trade offer. Only the seller can accept.",
          tags: ["Trade",],
        },
      },)
      .post(`${prefix}/worlds/:worldId/trade/offers/:offerId/cancel`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const body = ctx.body as { buyerActorId: string };
        const denied = await resolveActorAccess(opts.database, body.buyerActorId, userId,);
        if (denied) { return denied; }
        const res = await opts.svc().cancelOffer(ctx.params.offerId, body.buyerActorId,);
        if (!res.success) { return badRequestResponse(res.reason ?? "Cancel failed",); }
        return jsonResponse({ ok: true, },);
      }, {
        params: t.Object({ worldId: Id, offerId: Id, },),
        body: t.Object({ buyerActorId: Id, },),
        response: {
          200: t.Object({ ok: t.Boolean(), },),
          400: ErrorResponse,
          401: ErrorResponse,
          403: ErrorResponse,
        },
        detail: {
          summary: "Cancel trade offer",
          description: "Cancel a pending trade offer. Only the offer creator can cancel.",
          tags: ["Trade",],
        },
      },)
  );
}

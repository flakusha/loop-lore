// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Trade Routes
 *
 * Currency + trade endpoints over `TradeService` (src/services/trade):
 *   GET  /api/worlds/:worldId/trade/balance?actorId=&currency=  — actor balance
 *   POST /api/worlds/:worldId/trade/execute                     — atomic two-sided trade
 *
 * Ownership is resolved via the actor's owner (actors.user_id) for the
 * calling user. The `execute` endpoint accepts explicit buyer/seller actor
 * ids; the caller must own at least one side of the trade.
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { Db, } from "../db";
import type { DB, } from "../db/schema";
import { TradeService, } from "../services/trade";
import type { TradeLine, } from "../services/trade";
import { safeJsonStringify, } from "../utils/safe-json";
import { ErrorResponse, Id, } from "../validation/schemas";
import { badRequestResponse, jsonError, jsonResponse, notFoundResponse, } from "./http-utils";
import { requireUserId, } from "./http-utils/responses";

const tradeLineSchema = t.Object({
  worldItemId: Id,
  quantity: t.Integer({ minimum: 1, },),
},);

const executeBody = t.Object({
  buyerActorId: Id,
  sellerActorId: Id,
  buyerItems: t.Array(tradeLineSchema,),
  sellerItems: t.Array(tradeLineSchema,),
  price: t.Integer({ minimum: 0, },),
},);

const executeResponse = t.Object({
  ok: t.Boolean(),
  pricePaid: t.Optional(t.Integer(),),
  itemsOffered: t.Optional(t.Array(Id,),),
  itemsRequested: t.Optional(t.Array(Id,),),
  reason: t.Optional(t.String(),),
},);

/** Ensure the user owns the given actor (or is the world owner). Returns denial Response or null. */
async function resolveActorAccess(
  db: Kysely<DB>,
  actorId: string,
  userId: string,
): Promise<Response | null> {
  const actor = await db.selectFrom("actors",).select("user_id",).where("id", "=", actorId,).executeTakeFirst();
  if (!actor) { return notFoundResponse("Actor",); }
  if (actor.user_id !== userId) { return jsonError("Not allowed", 403,); }
  return null;
}

export function tradeRoutes({ database, }: { database: Db }, prefix = "/api",): Elysia {
  const svc = () => new TradeService(database,);
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
        const denied = await resolveActorAccess(database, body.buyerActorId, userId,);
        if (denied) { return denied; }
        const res = await svc().buyFromNpc({
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
        const denied = await resolveActorAccess(database, body.sellerActorId, userId,);
        if (denied) { return denied; }
        const res = await svc().sellToNpc({
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
      // ── Trade History ───────────────────────────────────────
      .get(`${prefix}/worlds/:worldId/trade/history`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const actorId = ctx.query.actorId as string | undefined;
        const limit = ctx.query.limit ? Number(ctx.query.limit,) : 50;
        if (actorId) {
          const denied = await resolveActorAccess(database, actorId, userId,);
          if (denied) { return denied; }
        }
        const history = await svc().getTradeHistory(ctx.params.worldId, actorId, limit,);
        return jsonResponse({ history, },);
      }, {
        params: t.Object({ worldId: Id, },),
        query: t.Object({
          actorId: t.Optional(Id,),
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
        },
        detail: {
          summary: "Trade history",
          description: "Query trade history for a world, optionally filtered by actor.",
          tags: ["Trade",],
        },
      },)
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
        const denied = await resolveActorAccess(database, body.buyerActorId, userId,);
        if (denied) { return denied; }
        const id = await svc().createOffer({
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
        const denied = await resolveActorAccess(database, actorId, userId,);
        if (denied) { return denied; }
        const offers = await svc().listOffers(ctx.params.worldId, actorId,);
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
        const denied = await resolveActorAccess(database, body.sellerActorId, userId,);
        if (denied) { return denied; }
        const res = await svc().acceptOffer(ctx.params.offerId, body.sellerActorId,);
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
        const denied = await resolveActorAccess(database, body.buyerActorId, userId,);
        if (denied) { return denied; }
        const res = await svc().cancelOffer(ctx.params.offerId, body.buyerActorId,);
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

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/* eslint-disable unicorn/max-nested-calls -- Kysely query chains and Elysia TypeBox schema nesting are inherent to the route layer */

/**
 * Crafting Order Routes
 *
 * Player-driven crafting commissions:
 *   POST   /api/worlds/:worldId/crafting-orders                  — place an order
 *   GET    /api/worlds/:worldId/crafting-orders                  — list orders
 *   POST   /api/worlds/:worldId/crafting-orders/:orderId/accept  — crafter accepts
 *   POST   /api/worlds/:worldId/crafting-orders/:orderId/fulfill — crafter fulfils
 *   POST   /api/worlds/:worldId/crafting-orders/:orderId/cancel  — requester cancels
 *
 * Actor endpoints are gated by ownership: the caller must own the actor named
 * in the request (see `resolveActorAccess`).
 */
import { Elysia, t, } from "elysia";
import type { Db, } from "../../db";
import type { QualityLevel, } from "../../db/enums";
import { CraftingOrderService, } from "../../rpg/crafting/orders";
import { ErrorResponse, Id, } from "../../validation/schemas";
import { jsonError, jsonResponse, } from "../http-utils";
import { requireUserId, } from "../http-utils/responses";
import { resolveActorAccess, } from "../trade/shared";

/** A single crafting order as returned by list/detail. */
const orderResponse = t.Object({
  id: Id,
  worldId: Id,
  requesterActorId: Id,
  crafterActorId: t.Nullable(Id,),
  recipeId: Id,
  quantity: t.Integer(),
  maxQuality: t.Nullable(t.String(),),
  offeredPayment: t.Integer(),
  offeredMaterials: t.Array(t.Any(),),
  status: t.String(),
  deadline: t.Nullable(t.String(),),
  createdAt: t.String(),
  updatedAt: t.String(),
  tradeType: t.String(),
},);

const listResponse = t.Object({ orders: t.Array(orderResponse,), },);

const fulfillResponse = t.Object({
  ok: t.Boolean(),
  attemptId: t.Optional(t.String(),),
  reason: t.Optional(t.String(),),
},);

export function craftingOrderRoutes({ database, }: { database: Db }, prefix = "/api",): Elysia {
  const svc = () => new CraftingOrderService(database,);
  return new Elysia({ name: "crafting-orders", },)
    .post(`${prefix}/worlds/:worldId/crafting-orders`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const body = ctx.body as Record<string, unknown>;
      const requesterActorId = body.requesterActorId as string;
      const denied = await resolveActorAccess(database, requesterActorId, userId,);
      if (denied) { return denied; }
      const id = await svc().placeOrder({
        worldId: ctx.params.worldId,
        requesterActorId,
        recipeId: body.recipeId as string,
        quantity: body.quantity as number | undefined,
        offeredPayment: body.offeredPayment as number | undefined,
        offeredMaterials: body.offeredMaterials as unknown[] | undefined,
        maxQuality: body.maxQuality as QualityLevel | null | undefined,
        deadline: body.deadline as string | null | undefined,
        tradeType: body.tradeType as string | undefined,
      },);
      return jsonResponse({ id, }, 201,);
    }, {
      params: t.Object({ worldId: Id, },),
      body: t.Object({
        requesterActorId: Id,
        recipeId: Id,
        quantity: t.Optional(t.Integer(),),
        offeredPayment: t.Optional(t.Integer(),),
        offeredMaterials: t.Optional(t.Array(t.Any(),),),
        maxQuality: t.Optional(t.String(),),
        deadline: t.Optional(t.String(),),
        tradeType: t.Optional(t.String(),),
      },),
      response: {
        201: t.Object({ id: Id, },),
        400: ErrorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
      },
      detail: {
        summary: "Place a crafting order",
        description: "Open a crafting commission as the requester actor.",
        tags: ["Crafting",],
      },
    },)
    .get(`${prefix}/worlds/:worldId/crafting-orders`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const actorId = (ctx.query as Record<string, string | undefined>).actorId;
      if (actorId) {
        const denied = await resolveActorAccess(database, actorId, userId,);
        if (denied) { return denied; }
      }
      const orders = await svc().listOrders(ctx.params.worldId, actorId,);
      return jsonResponse({ orders, },);
    }, {
      params: t.Object({ worldId: Id, },),
      query: t.Object({ actorId: t.Optional(Id,), },),
      response: { 200: listResponse, 401: ErrorResponse, 403: ErrorResponse, },
      detail: {
        summary: "List crafting orders",
        description: "List a world's crafting orders, optionally scoped to an actor.",
        tags: ["Crafting",],
      },
    },)
    .post(`${prefix}/worlds/:worldId/crafting-orders/:orderId/accept`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const body = ctx.body as { crafterActorId: string };
      const denied = await resolveActorAccess(database, body.crafterActorId, userId,);
      if (denied) { return denied; }
      const accepted = await svc().acceptOrder(ctx.params.orderId, body.crafterActorId,);
      if (!accepted) { return jsonError("Order is not open for acceptance", 409,); }
      return jsonResponse({ ok: true, },);
    }, {
      params: t.Object({ worldId: Id, orderId: Id, },),
      body: t.Object({ crafterActorId: Id, },),
      response: {
        200: t.Object({ ok: t.Boolean(), },),
        400: ErrorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        409: ErrorResponse,
      },
      detail: {
        summary: "Accept a crafting order",
        description: "A crafter claims an open crafting order.",
        tags: ["Crafting",],
      },
    },)
    .post(`${prefix}/worlds/:worldId/crafting-orders/:orderId/fulfill`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const result = await svc().fulfillOrder(ctx.params.orderId,);
      return jsonResponse(result,);
    }, {
      params: t.Object({ worldId: Id, orderId: Id, },),
      response: { 200: fulfillResponse, 401: ErrorResponse, },
      detail: {
        summary: "Fulfil a crafting order",
        description: "Run the recipe and transfer payment, marking the order fulfilled.",
        tags: ["Crafting",],
      },
    },)
    .post(`${prefix}/worlds/:worldId/crafting-orders/:orderId/cancel`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const body = ctx.body as { actorId: string };
      const denied = await resolveActorAccess(database, body.actorId, userId,);
      if (denied) { return denied; }
      const cancelled = await svc().cancelOrder(ctx.params.orderId, body.actorId,);
      if (!cancelled) { return jsonError("Order cannot be cancelled", 409,); }
      return jsonResponse({ ok: true, },);
    }, {
      params: t.Object({ worldId: Id, orderId: Id, },),
      body: t.Object({ actorId: Id, },),
      response: {
        200: t.Object({ ok: t.Boolean(), },),
        400: ErrorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        409: ErrorResponse,
      },
      detail: {
        summary: "Cancel a crafting order",
        description: "Requester cancels an open or accepted order.",
        tags: ["Crafting",],
      },
    },);
}

/* eslint-enable unicorn/max-nested-calls */

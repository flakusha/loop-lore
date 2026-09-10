// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Actor Items Gameplay Routes
 *
 * Action endpoints layered over the generic actor-items CRUD:
 *   POST   /api/actors/:actorId/items/:itemId/equip      — equip item
 *   POST   /api/actors/:actorId/items/:itemId/unequip    — unequip item
 *   GET    /api/actors/:actorId/items/equipped           — list equipped
 *   GET    /api/actors/:actorId/items/carry              — weight/capacity
 *   POST   /api/actors/:actorId/items/:itemId/transfer   — move to another actor
 *
 * All routes resolve ownership via the actor's `user_id`.
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { Db, } from "../../db";
import type { DB, } from "../../db/schema";
import { ActorItemsService, } from "../../services/actor-items";
import { ErrorResponse, Id, } from "../../validation/schemas";
import { badRequestResponse, jsonError, jsonResponse, notFoundResponse, } from "../http-utils";
import { withOwnerAuth, } from "../http-utils/auth-narrowing";

const carryResponse = t.Object({
  carried: t.Number(),
  capacity: t.Number(),
  encumbrance: t.Union([t.Literal("light",), t.Literal("medium",), t.Literal("overloaded",),],),
},);

const actionResponse = t.Object({
  ok: t.Boolean(),
  itemId: t.Optional(t.String(),),
  transferred: t.Optional(t.Number(),),
  reason: t.Optional(t.String(),),
},);

const transferBody = t.Object({ toActorId: Id, quantity: t.Number(), },);

/**
 * Resolve the actor's owner; returns a denial Response or null when allowed.
 * @param db
 * @param actorId
 * @param userId
 */
async function resolveActorOwner(
  db: Kysely<DB>,
  actorId: string,
  userId: string,
): Promise<Response | null> {
  const actor = await db
    .selectFrom("actors",)
    .select("user_id",)
    .where("id", "=", actorId,)
    .executeTakeFirst();
  if (!actor) { return notFoundResponse("Actor",); }
  if (actor.user_id !== userId) { return jsonError("Not allowed", 403,); }
  return null;
}

/**
 * Adapter: bind `database` and `actorId` into a (userId) => Promise<Response | null>.
 * @param db
 * @param actorId
 */
function actorOwnerCheck(db: Kysely<DB>, actorId: string,): (userId: string,) => Promise<Response | null> {
  return (userId,) => resolveActorOwner(db, actorId, userId,);
}

/**
 * @param root0
 * @param root0.database
 * @param prefix
 */
export function actorItemsGameplayRoutes({ database, }: { database: Db }, prefix = "/api",): Elysia {
  return new Elysia({ name: "actor-items-gameplay", },)
    .post(`${prefix}/actors/:actorId/items/:itemId/equip`, async (ctx: any,) => {
      return withOwnerAuth(ctx, actorOwnerCheck(database, ctx.params.actorId,), async () => {
        const res = await new ActorItemsService(database,).equip(ctx.params.actorId, ctx.params.itemId,);
        if (!res.ok) { return badRequestResponse(res.reason ?? "Cannot equip",); }
        return jsonResponse(res,);
      },);
    }, {
      params: t.Object({ actorId: Id, itemId: Id, },),
      response: {
        200: actionResponse,
        400: ErrorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Equip actor item",
        description: "Equip an actor item, validating slot conflicts.",
        tags: ["Actor Items",],
      },
    },)
    .post(`${prefix}/actors/:actorId/items/:itemId/unequip`, async (ctx: any,) => {
      return withOwnerAuth(ctx, actorOwnerCheck(database, ctx.params.actorId,), async () => {
        const res = await new ActorItemsService(database,).unequip(ctx.params.actorId, ctx.params.itemId,);
        if (!res.ok) { return badRequestResponse(res.reason ?? "Cannot unequip",); }
        return jsonResponse(res,);
      },);
    }, {
      params: t.Object({ actorId: Id, itemId: Id, },),
      response: {
        200: actionResponse,
        400: ErrorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
      detail: { summary: "Unequip actor item", description: "Unequip an actor item.", tags: ["Actor Items",], },
    },)
    .get(`${prefix}/actors/:actorId/items/equipped`, async (ctx: any,) => {
      return withOwnerAuth(ctx, actorOwnerCheck(database, ctx.params.actorId,), async () => {
        const items = await new ActorItemsService(database,).getEquipped(ctx.params.actorId,);
        return jsonResponse(items,);
      },);
    }, {
      params: t.Object({ actorId: Id, },),
      detail: {
        summary: "List equipped items",
        description: "List all items currently equipped by an actor.",
        tags: ["Actor Items",],
      },
    },)
    .get(`${prefix}/actors/:actorId/items/carry`, async (ctx: any,) => {
      return withOwnerAuth(ctx, actorOwnerCheck(database, ctx.params.actorId,), async () => {
        const status = await new ActorItemsService(database,).getCarryStatus(ctx.params.actorId,);
        return jsonResponse(status,);
      },);
    }, {
      params: t.Object({ actorId: Id, },),
      response: { 200: carryResponse, 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Actor carry status",
        description: "Current carried weight, capacity, and encumbrance for an actor.",
        tags: ["Actor Items",],
      },
    },)
    .post(`${prefix}/actors/:actorId/items/:itemId/transfer`, async (ctx: any,) => {
      return withOwnerAuth(ctx, actorOwnerCheck(database, ctx.params.actorId,), async () => {
        const { toActorId, quantity, } = ctx.body as { toActorId: string; quantity: number };
        const res = await new ActorItemsService(database,).transfer(
          ctx.params.actorId,
          toActorId,
          ctx.params.itemId,
          quantity,
        );
        if (!res.ok) { return badRequestResponse(res.reason ?? "Cannot transfer",); }
        return jsonResponse(res,);
      },);
    }, {
      params: t.Object({ actorId: Id, itemId: Id, },),
      body: transferBody,
      response: {
        200: actionResponse,
        400: ErrorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Transfer actor item",
        description: "Transfer an item between two actors.",
        tags: ["Actor Items",],
      },
    },);
}

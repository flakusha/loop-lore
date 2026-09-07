// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Crafting Attempt Routes
 *
 * Wraps `CraftingProcessService` (src/rpg/crafting) to expose a craft action
 * over HTTP:
 *   POST /api/worlds/:worldId/craft                    — attempt a craft
 *                                                     (consume materials → roll → output)
 *   GET  /api/worlds/:worldId/actors/:actorId/craft-attempts — list an actor's attempts
 *   GET  /api/worlds/:worldId/craft-attempts/:attemptId      — get one attempt
 *
 * The caller must own the crafting actor (actors.user_id).
 */
import { Elysia, t, } from "elysia";
import type { Db, } from "../../db";
import { CraftingProcessService, } from "../../rpg/crafting";
import { ErrorResponse, Id, } from "../../validation/schemas";
import { jsonResponse, notFoundResponse, } from "../http-utils";
import { requireUserId, } from "../http-utils/responses";
import { resolveActorAccess, } from "../actor-access";

const materialRecordSchema = t.Object({
  itemId: Id,
  quantity: t.Integer({ minimum: 0, },),
},);

const craftResultSchema = t.Object({
  attemptId: Id,
  status: t.Union([
    t.Literal("pending",),
    t.Literal("success",),
    t.Literal("failure",),
    t.Literal("critical_success",),
  ],),
  quality: t.Integer(),
  outputItemId: t.Union([Id, t.Null(),],),
  outputQuantity: t.Integer(),
  materialsConsumed: t.Array(materialRecordSchema,),
  materialsSaved: t.Array(materialRecordSchema,),
},);
const craftAttemptSchema = t.Object({
  id: Id,
  actorId: Id,
  worldId: Id,
  recipeId: Id,
  stationInstanceId: t.Union([Id, t.Null(),],),
  materialsUsed: t.Array(materialRecordSchema,),
  status: t.Union([
    t.Literal("pending",),
    t.Literal("success",),
    t.Literal("failure",),
    t.Literal("critical_success",),
  ],),
  qualityAchieved: t.Integer(),
  outputItemId: t.Union([Id, t.Null(),],),
  outputQuantity: t.Integer(),
  experienceGained: t.Integer(),
  skillIncrease: t.Integer(),
  bonusEffects: t.String(),
  createdAt: t.String(),
},);

/**
 * @param root0
 * @param root0.database
 * @param prefix
 */
export function craftingAttemptRoutes({ database, }: { database: Db }, prefix = "/api",): Elysia {
  const svc = () => new CraftingProcessService(database,);
  return new Elysia({ name: "crafting-attempts", },)
    .post(`${prefix}/worlds/:worldId/craft`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const body = ctx.body as { actorId: string; recipeId: string; stationInstanceId?: string };
      const denied = await resolveActorAccess(database, body.actorId, userId,);
      if (denied) { return denied; }
      const result = await svc().attemptCraft({
        actorId: body.actorId,
        worldId: ctx.params.worldId,
        recipeId: body.recipeId,
        stationInstanceId: body.stationInstanceId,
      },);
      return jsonResponse(result,);
    }, {
      params: t.Object({ worldId: Id, },),
      body: t.Object({
        actorId: Id,
        recipeId: Id,
        stationInstanceId: t.Optional(Id,),
      },),
      response: {
        200: craftResultSchema,
        400: ErrorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Attempt a craft",
        description: "Consume recipe materials from the actor's inventory and roll for output.",
        tags: ["Crafting",],
      },
    },)
    .get(`${prefix}/worlds/:worldId/actors/:actorId/craft-attempts`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const denied = await resolveActorAccess(database, ctx.params.actorId, userId,);
      if (denied) { return denied; }
      const attempts = await svc().listAttempts(ctx.params.actorId, ctx.params.worldId,);
      return jsonResponse({ attempts, },);
    }, {
      params: t.Object({ worldId: Id, actorId: Id, },),
      response: {
        200: t.Object({ attempts: t.Array(craftAttemptSchema,), },),
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "List craft attempts",
        description: "List an actor's crafting attempts in a world.",
        tags: ["Crafting",],
      },
    },)
    .get(`${prefix}/worlds/:worldId/craft-attempts/:attemptId`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const attempt = await svc().getAttempt(ctx.params.attemptId,);
      if (!attempt) { return notFoundResponse("Craft attempt",); }
      const denied = await resolveActorAccess(database, attempt.actorId, userId,);
      if (denied) { return denied; }
      return jsonResponse(attempt,);
    }, {
      params: t.Object({ worldId: Id, attemptId: Id, },),
      response: { 200: craftAttemptSchema, 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Get craft attempt",
        description: "Get a single crafting attempt by id (ownership-gated).",
        tags: ["Crafting",],
      },
    },);
}

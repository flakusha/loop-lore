// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Recipe Discovery Routes
 *
 * Wraps `DiscoveryService` (src/rpg/crafting) to expose a character's recipe
 * knowledge:
 *   GET  /api/worlds/:worldId/actors/:actorId/recipe-discoveries — list discovered recipes
 *   POST /api/worlds/:worldId/actors/:actorId/recipe-discoveries — record a discovery
 *                                                                (recipe book, NPC teaching, …)
 *
 * Experimentation discoveries are not posted here — the craft process records
 * them itself when an `experiment: true` craft succeeds (see attempt.ts).
 * The caller must own the crafting actor (actors.user_id).
 */
import { Elysia, t, } from "elysia";
import type { Db, } from "../../db";
import { DiscoveryMethod, } from "../../db/enums";
import { DiscoveryService, } from "../../rpg/crafting";
import { ErrorResponse, Id, } from "../../validation/schemas";
import { resolveActorAccess, } from "../actor-access";
import { jsonResponse, notFoundResponse, } from "../http-utils";
import { requireUserId, } from "../http-utils/responses";

/** Every discovery method the craft process can record. */
const discoveryMethodSchema = t.Enum(DiscoveryMethod,);

/** Methods a client may declare directly; `experimentation` is craft-internal. */
const learnMethodSchema = t.Union([
  t.Literal("recipe_book",),
  t.Literal("npc_teaching",),
  t.Literal("quest_reward",),
  t.Literal("world_discovery",),
  t.Literal("starting_kit",),
],);

const discoverySchema = t.Object({
  id: Id,
  actorId: Id,
  worldId: Id,
  recipeId: Id,
  discoveryMethod: discoveryMethodSchema,
  discoveredAt: t.String(),
  masteryLevel: t.Integer(),
  createdAt: t.Union([t.String(), t.Null(),],),
  updatedAt: t.Union([t.String(), t.Null(),],),
},);

const discoveredRecipeSchema = t.Intersect([
  discoverySchema,
  t.Object({
    recipeName: t.String(),
    discipline: t.String(),
    tier: t.Integer(),
  },),
],);

/**
 * @param root0
 * @param root0.database
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, {}, { derive: {}; resolve: {}; schema: {}; standaloneSchema: {}; response: {}; }, { ...; }>}
 */
export function craftingDiscoveryRoutes({ database, }: { database: Db }, prefix = "/api",): Elysia {
  const svc = () => new DiscoveryService(database,);
  return new Elysia({ name: "crafting-discoveries", },)
    .get(`${prefix}/worlds/:worldId/actors/:actorId/recipe-discoveries`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const denied = await resolveActorAccess(database, ctx.params.actorId, userId,);
      if (denied) { return denied; }
      const discoveries = await svc().listDiscovered(ctx.params.actorId, ctx.params.worldId,);
      return jsonResponse({ discoveries, },);
    }, {
      params: t.Object({ worldId: Id, actorId: Id, },),
      response: {
        200: t.Object({ discoveries: t.Array(discoveredRecipeSchema,), },),
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "List discovered recipes",
        description: "List the crafting recipes an actor has discovered in a world.",
        tags: ["Crafting",],
      },
    },)
    .post(`${prefix}/worlds/:worldId/actors/:actorId/recipe-discoveries`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const body = ctx.body as {
        recipeId: string;
        method: DiscoveryMethod;
        masteryLevel?: number;
      };

      const denied = await resolveActorAccess(database, ctx.params.actorId, userId,);
      if (denied) { return denied; }

      const recipe = await database.selectFrom("crafting_recipes",)
        .select("id",).where("id", "=", body.recipeId,).executeTakeFirst();

      if (!recipe) { return notFoundResponse("Recipe",); }

      const { discovery, created, } = await svc().recordDiscovery({
        actorId: ctx.params.actorId,
        worldId: ctx.params.worldId,
        recipeId: body.recipeId,
        method: body.method,
        masteryLevel: body.masteryLevel,
      },);

      return jsonResponse({ discovery, created, },);
    }, {
      params: t.Object({ worldId: Id, actorId: Id, },),
      body: t.Object({
        recipeId: Id,
        method: learnMethodSchema,
        masteryLevel: t.Optional(t.Integer({ minimum: 0, },),),
      },),
      response: {
        200: t.Object({ discovery: discoverySchema, created: t.Boolean(), },),
        400: ErrorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Record a recipe discovery",
        description:
          "Record that an actor learned a recipe (recipe book, NPC teaching, quest reward, world discovery, starting kit). Idempotent per actor+recipe.",
        tags: ["Crafting",],
      },
    },);
}

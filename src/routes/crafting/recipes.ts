/**
 * Crafting Recipe Routes
 *
 * CRUD endpoints for crafting recipes and their material requirements,
 * backed by `RecipesService` (src/rpg/crafting):
 *   GET    /api/worlds/:worldId/recipes            — list (filter discipline/tier)
 *   POST   /api/worlds/:worldId/recipes            — create with materials
 *   GET    /api/worlds/:worldId/recipes/:recipeId  — get one with materials
 *   PUT    /api/worlds/:worldId/recipes/:recipeId  — update base properties
 *   DELETE /api/worlds/:worldId/recipes/:recipeId  — delete + cascade materials
 *   PUT    /api/worlds/:worldId/recipes/:recipeId/materials — replace materials
 *
 * All routes resolve world ownership via `worlds.owner_id`.
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { Db, } from "../../db";
import { CraftingDiscipline, CraftingStationType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { RecipesService, } from "../../rpg/crafting";
import { ErrorResponse, Id, } from "../../validation/schemas";
import { badRequestResponse, jsonError, jsonResponse, notFoundResponse, } from "../http-utils";
import { requireUserId, } from "../http-utils/responses";
import {
  createRecipeBody,
  listResponse,
  recipeMaterialSchema,
  recipeResponse,
  updateRecipeBody,
} from "./recipes-schemas";

/** Resolve the world's owner; returns a denial Response or null when allowed. */
async function resolveWorldOwner(
  db: Kysely<DB>,
  worldId: string,
  userId: string,
): Promise<Response | null> {
  const world = await db
    .selectFrom("worlds",)
    .select("owner_id",)
    .where("id", "=", worldId,)
    .executeTakeFirst();
  if (!world) { return notFoundResponse("World",); }
  if (world.owner_id !== userId) { return jsonError("Not allowed", 403,); }
  return null;
}

export function craftingRecipeRoutes({ database, }: { database: Db }, prefix = "/api",): Elysia {
  const svc = () => new RecipesService(database,);
  return (
    new Elysia({ name: "crafting-recipes", },)
      .get(prefix + "/worlds/:worldId/recipes", async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const denied = await resolveWorldOwner(database, ctx.params.worldId, userId,);
        if (denied) { return denied; }
        const { discipline, tier, limit, offset, } = ctx.query as Record<string, string | undefined>;
        const recipes = await svc().listRecipes(ctx.params.worldId, {
          discipline: discipline as CraftingDiscipline | undefined,
          tier: tier ? Number(tier,) : undefined,
        },);
        const page = recipes.slice(Number(offset,) || 0, (Number(limit,) || 50) + (Number(offset,) || 0),);
        return jsonResponse({ recipes: page, },);
      }, {
        params: t.Object({ worldId: Id, },),
        query: t.Object({
          discipline: t.Optional(t.Enum(CraftingDiscipline,),),
          tier: t.Optional(t.String(),),
          limit: t.Optional(t.String(),),
          offset: t.Optional(t.String(),),
        },),
        response: { 200: listResponse, 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "List crafting recipes",
          description: "List recipes for a world, optionally filtered by discipline/tier.",
          tags: ["Crafting",],
        },
      },)
      .post(prefix + "/worlds/:worldId/recipes", async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const denied = await resolveWorldOwner(database, ctx.params.worldId, userId,);
        if (denied) { return denied; }
        const body = ctx.body as Record<string, unknown>;
        const id = await svc().createRecipe({
          worldId: ctx.params.worldId,
          name: body.name as string,
          description: body.description as string | undefined,
          discipline: body.discipline as CraftingDiscipline,
          tier: body.tier as number,
          levelRequired: body.levelRequired as number,
          outputItemId: body.outputItemId as string,
          outputQuantity: body.outputQuantity as number | undefined,
          craftingTimeSeconds: body.craftingTimeSeconds as number | undefined,
          baseSuccessChance: body.baseSuccessChance as number | undefined,
          baseQualityMin: body.baseQualityMin as number | undefined,
          baseQualityMax: body.baseQualityMax as number | undefined,
          perfectThreshold: body.perfectThreshold as number | undefined,
          stationTypeRequired: body.stationTypeRequired as CraftingStationType | undefined,
          discoveredByDefault: body.discoveredByDefault as boolean | undefined,
          tags: body.tags as string[] | undefined,
          materials: body.materials as never[] ?? [],
        },);
        return jsonResponse({ id, }, 201,);
      }, {
        params: t.Object({ worldId: Id, },),
        body: createRecipeBody,
        response: {
          201: t.Object({ id: Id, },),
          400: ErrorResponse,
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Create crafting recipe",
          description: "Create a recipe with its material requirements.",
          tags: ["Crafting",],
        },
      },)
      .get(prefix + "/worlds/:worldId/recipes/:recipeId", async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const denied = await resolveWorldOwner(database, ctx.params.worldId, userId,);
        if (denied) { return denied; }
        const recipe = await svc().getRecipe(ctx.params.recipeId,);
        if (!recipe) { return notFoundResponse("Recipe",); }
        return jsonResponse(recipe,);
      }, {
        params: t.Object({ worldId: Id, recipeId: Id, },),
        response: { 200: recipeResponse, 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "Get crafting recipe",
          description: "Get a single recipe with its materials.",
          tags: ["Crafting",],
        },
      },)
      .put(prefix + "/worlds/:worldId/recipes/:recipeId", async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const denied = await resolveWorldOwner(database, ctx.params.worldId, userId,);
        if (denied) { return denied; }
        const body = ctx.body as Record<string, unknown>;
        const ok = await svc().updateRecipe(ctx.params.recipeId, body as never,);
        if (!ok) { return notFoundResponse("Recipe",); }
        return jsonResponse({ ok: true, },);
      }, {
        params: t.Object({ worldId: Id, recipeId: Id, },),
        body: updateRecipeBody,
        response: {
          200: t.Object({ ok: t.Boolean(), },),
          400: ErrorResponse,
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Update crafting recipe",
          description: "Update a recipe's base properties.",
          tags: ["Crafting",],
        },
      },)
      .delete(prefix + "/worlds/:worldId/recipes/:recipeId", async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const denied = await resolveWorldOwner(database, ctx.params.worldId, userId,);
        if (denied) { return denied; }
        const ok = await svc().deleteRecipe(ctx.params.recipeId,);
        if (!ok) { return notFoundResponse("Recipe",); }
        return jsonResponse({ ok: true, },);
      }, {
        params: t.Object({ worldId: Id, recipeId: Id, },),
        response: { 200: t.Object({ ok: t.Boolean(), },), 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "Delete crafting recipe",
          description: "Delete a recipe and its materials.",
          tags: ["Crafting",],
        },
      },)
      .put(prefix + "/worlds/:worldId/recipes/:recipeId/materials", async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const denied = await resolveWorldOwner(database, ctx.params.worldId, userId,);
        if (denied) { return denied; }
        const body = ctx.body as { materials: never[] };
        if (!Array.isArray(body.materials,)) { return badRequestResponse("materials must be an array",); }
        await svc().replaceMaterials(ctx.params.recipeId, body.materials,);
        return jsonResponse({ ok: true, },);
      }, {
        params: t.Object({ worldId: Id, recipeId: Id, },),
        body: t.Object({ materials: t.Array(recipeMaterialSchema,), },),
        response: {
          200: t.Object({ ok: t.Boolean(), },),
          400: ErrorResponse,
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Replace recipe materials",
          description: "Replace all materials for a recipe.",
          tags: ["Crafting",],
        },
      },)
  ) as unknown as Elysia;
}

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Craft Execution Route — attempt a craft via the crafting process service.
 *
 *   POST /api/rpg/craft — attempt a craft
 */
import { Elysia, t, } from "elysia";
import { CraftingProcessService, } from "../../rpg/crafting";
import { ErrorResponse, Id, SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonResponse, requireUserId, } from "../http-utils";
import { HttpStatus, } from "../http-utils/status";
import { log, } from "./log";
import type { HandlerOpts, } from "./types";

// ── Body schema ──────────────────────────────────────────

const CraftBody = t.Object({
  actorId: Id,
  recipeId: Id,
  stationInstanceId: t.Optional(Id,),
},);

// ── Routes ───────────────────────────────────────────────

export function craftingExecutionRoutes(opts: HandlerOpts, prefix = "/api",): Elysia {
  const R = `${prefix}/rpg/craft`;

  return (
    new Elysia({ name: "rpg-crafting-execution", },)
      .post(R, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const body = ctx.body as {
          actorId: string;
          recipeId: string;
          stationInstanceId?: string;
        };

        // Actor ownership check
        const actor = await opts.database.selectFrom("actors",)
          .select("user_id",).where("id", "=", body.actorId,).executeTakeFirst();
        if (!actor) { return jsonError("Actor not found", HttpStatus.NotFound,); }
        if (actor.user_id !== userId) { return jsonError("Forbidden", HttpStatus.Forbidden,); }

        // Get worldId from recipe
        const recipe = await opts.database.selectFrom("crafting_recipes",)
          .select("world_id",).where("id", "=", body.recipeId,).executeTakeFirst();
        if (!recipe) { return jsonError("Recipe not found", HttpStatus.NotFound,); }

        const svc = new CraftingProcessService(opts.database,);
        try {
          const result = await svc.attemptCraft({
            actorId: body.actorId,
            recipeId: body.recipeId,
            stationInstanceId: body.stationInstanceId,
            worldId: recipe.world_id,
          },);
          return jsonResponse(result,);
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Craft failed";
          log().error("Craft attempt failed", error instanceof Error ? error : undefined,);
          if (msg.includes("not found",) || msg.includes("Insufficient",) || msg.includes("required",)) {
            return jsonError(msg, HttpStatus.BadRequest,);
          }
          return jsonError("Internal server error", HttpStatus.InternalServerError,);
        }
      }, {
        body: CraftBody,
        response: { 200: SuccessResponse, 401: ErrorResponse, },
        detail: {
          summary: "Attempt a craft",
          description: "Consume materials and roll for craft outcome. Optionally uses a station.",
          tags: ["RPG", "Crafting",],
        },
      },)
  );
}

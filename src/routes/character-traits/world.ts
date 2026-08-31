// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * World-scoped trait routes (Layer 2).
 */
import { Elysia, t, } from "elysia";
import { TraitsService, } from "../../characters/services/traits-service";
import {
  ErrorResponse,
  SuccessResponse,
  TraitResponse,
  WorldTraitCreateBody,
} from "../../validation/schemas";
import { type HandlerOpts, requireActorAccess, } from "../actor-auth";
import { HttpStatus, jsonCreated, jsonError, jsonNoContent, jsonResponse, } from "../http-utils";

const ActorIdWorldParams = t.Object({
  actorId: t.String({ format: "uuid", },),
  worldId: t.String({ format: "uuid", },),
},);

const ActorIdWorldTraitParams = t.Object({
  actorId: t.String({ format: "uuid", },),
  worldId: t.String({ format: "uuid", },),
  traitName: t.String(),
},);

/**
 * @param opts
 * @param prefix
 */
export function worldTraitRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;
  const traitsService = TraitsService(database,);

  return new Elysia({ name: "character-traits-world", },)
    .get(`${prefix}/actors/:actorId/traits/world/:worldId`, async (ctx,) => {
      const userId = await requireActorAccess(ctx, database,);
      if (userId instanceof Response) { return userId; }

      const { actorId, worldId, } = ctx.params as { actorId: string; worldId: string };
      const traits = await traitsService.getWorldTraits(actorId, worldId,);
      return jsonResponse(traits,);
    }, {
      params: ActorIdWorldParams,
      response: { 200: t.Array(TraitResponse,), 401: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "List world traits",
        description: "List all world-scoped traits for an actor.",
        tags: ["Character Traits",],
      },
    },)
    .post(`${prefix}/actors/:actorId/traits/world/:worldId`, async (ctx,) => {
      const userId = await requireActorAccess(ctx, database,);
      if (userId instanceof Response) { return userId; }

      const { actorId, worldId, } = ctx.params as { actorId: string; worldId: string };
      const { trait_category, trait_name, value, } = (ctx.body ?? {}) as Record<string, unknown>;

      if (!trait_name || !trait_category) {
        return jsonError({ message: "trait_category and trait_name are required", status: HttpStatus.BadRequest, },);
      }

      const id = await traitsService.createWorldTrait({
        actorId,
        worldId,
        category: trait_category as string,
        name: trait_name as string,
        value: (value as string) ?? "",
      },);
      return jsonCreated({ id, },);
    }, {
      params: ActorIdWorldParams,
      body: WorldTraitCreateBody,
      response: { 201: t.Object({ id: t.String(), },), 401: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Create world trait",
        description: "Create a world-scoped trait for an actor.",
        tags: ["Character Traits",],
      },
    },)
    .delete(`${prefix}/actors/:actorId/traits/world/:worldId/:traitName`, async (ctx,) => {
      const userId = await requireActorAccess(ctx, database,);
      if (userId instanceof Response) { return userId; }

      const { actorId, worldId, traitName, } = ctx.params as { actorId: string; worldId: string; traitName: string };
      await traitsService.deleteWorldTrait(actorId, worldId, traitName,);
      return jsonNoContent();
    }, {
      params: ActorIdWorldTraitParams,
      response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Delete world trait",
        description: "Delete a world-scoped trait from an actor.",
        tags: ["Character Traits",],
      },
    },);
}

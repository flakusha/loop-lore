// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Permanent trait routes (Layer 0).
 */
import { Elysia, t, } from "elysia";
import { TraitsService, } from "../../characters/services/traits-service";
import {
  ActorIdParams,
  ErrorResponse,
  SuccessResponse,
  TraitCreateBody,
  TraitResponse,
  TraitUpdateBody,
} from "../../validation/schemas";
import { type HandlerOpts, requireActorAccess, } from "../actor-auth";
import { HttpStatus, jsonCreated, jsonError, jsonNoContent, jsonResponse, } from "../http-utils";

const ActorIdTraitParams = t.Object({
  actorId: t.String({ format: "uuid", },),
  traitName: t.String(),
},);

/**
 * @param opts
 * @param prefix
 */
export function permanentTraitRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;
  const traitsService = TraitsService(database,);

  return new Elysia({ name: "character-traits-permanent", },)
    .get(`${prefix}/actors/:actorId/traits`, async (ctx,) => {
      const userId = await requireActorAccess(ctx, database,);
      if (userId instanceof Response) { return userId; }

      const { actorId, } = ctx.params as { actorId: string };
      const traits = await traitsService.getPermanentTraits(actorId,);
      return jsonResponse(traits,);
    }, {
      params: ActorIdParams,
      response: { 200: t.Array(TraitResponse,), 401: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "List actor traits",
        description: "List all permanent traits for an actor.",
        tags: ["Character Traits",],
      },
    },)
    .post(`${prefix}/actors/:actorId/traits`, async (ctx,) => {
      const userId = await requireActorAccess(ctx, database,);
      if (userId instanceof Response) { return userId; }

      const { actorId, } = ctx.params as { actorId: string };
      const { trait_category, trait_name, value, } = (ctx.body ?? {}) as Record<string, unknown>;

      if (!trait_name || !trait_category) {
        return jsonError({ message: "trait_category and trait_name are required", status: HttpStatus.BadRequest, },);
      }

      const id = await traitsService.createPermanentTrait({
        actorId,
        category: trait_category as string,
        name: trait_name as string,
        value: (value as string) ?? "",
      },);
      return jsonCreated({ id, },);
    }, {
      params: ActorIdParams,
      body: TraitCreateBody,
      response: { 201: t.Object({ id: t.String(), },), 401: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Create trait",
        description: "Create a permanent trait for an actor.",
        tags: ["Character Traits",],
      },
    },)
    .put(`${prefix}/actors/:actorId/traits/:traitName`, async (ctx,) => {
      const userId = await requireActorAccess(ctx, database,);
      if (userId instanceof Response) { return userId; }

      const { actorId, traitName, } = ctx.params as { actorId: string; traitName: string };
      const { value, } = (ctx.body ?? {}) as Record<string, unknown>;

      await traitsService.updatePermanentTrait(actorId, { name: traitName, value: (value as string) ?? "", },);
      return jsonResponse({ ok: true, },);
    }, {
      params: ActorIdTraitParams,
      body: TraitUpdateBody,
      response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Update trait",
        description: "Update a permanent trait value for an actor.",
        tags: ["Character Traits",],
      },
    },)
    .delete(`${prefix}/actors/:actorId/traits/:traitName`, async (ctx,) => {
      const userId = await requireActorAccess(ctx, database,);
      if (userId instanceof Response) { return userId; }

      const { actorId, traitName, } = ctx.params as { actorId: string; traitName: string };
      await traitsService.deletePermanentTrait(actorId, traitName,);
      return jsonNoContent();
    }, {
      params: ActorIdTraitParams,
      response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Delete trait",
        description: "Delete a permanent trait from an actor.",
        tags: ["Character Traits",],
      },
    },);
}

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Location-scoped trait routes (Layer 3).
 */
import { Elysia, t, } from "elysia";
import { TraitsService, } from "../../characters/services/traits-service";
import {
  ErrorResponse,
  LocationTraitCreateBody,
  SuccessResponse,
  TraitResponse,
} from "../../validation/schemas";
import { type HandlerOpts, requireActorAccess, } from "../actor-auth";
import { HttpStatus, jsonCreated, jsonError, jsonNoContent, jsonResponse, } from "../http-utils";

const ActorIdLocationParams = t.Object({
  actorId: t.String({ format: "uuid", },),
  locationId: t.String({ format: "uuid", },),
},);

const ActorIdLocationTraitParams = t.Object({
  actorId: t.String({ format: "uuid", },),
  locationId: t.String({ format: "uuid", },),
  traitName: t.String(),
},);

/**
 * @param opts
 * @param prefix
 */
export function locationTraitRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;
  const traitsService = TraitsService(database,);

  return new Elysia({ name: "character-traits-location", },)
    .get(`${prefix}/actors/:actorId/traits/location/:locationId`, async (ctx,) => {
      const userId = await requireActorAccess(ctx, database,);
      if (userId instanceof Response) { return userId; }

      const { actorId, locationId, } = ctx.params as { actorId: string; locationId: string };
      const traits = await traitsService.getLocationTraits(actorId, locationId,);
      return jsonResponse(traits,);
    }, {
      params: ActorIdLocationParams,
      response: { 200: t.Array(TraitResponse,), 401: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "List location traits",
        description: "List all location-scoped traits for an actor.",
        tags: ["Character Traits",],
      },
    },)
    .post(`${prefix}/actors/:actorId/traits/location/:locationId`, async (ctx,) => {
      const userId = await requireActorAccess(ctx, database,);
      if (userId instanceof Response) { return userId; }

      const { actorId, locationId, } = ctx.params as { actorId: string; locationId: string };
      const body = (ctx.body ?? {}) as Record<string, unknown>;

      const { trait_category, trait_name, value, bonus, penalty, effects, } = body;
      if (!trait_name) {
        return jsonError({ message: "trait_name is required", status: HttpStatus.BadRequest, },);
      }

      const id = await traitsService.createLocationTrait({
        actorId,
        locationId,
        category: (trait_category as string | undefined) ?? "custom",
        name: trait_name as string,
        value: (value as string | undefined) ?? "",
        bonus: bonus as number | undefined,
        penalty: penalty as number | undefined,
        effects: effects as string | undefined,
      },);
      return jsonCreated({ id, },);
    }, {
      params: ActorIdLocationParams,
      body: LocationTraitCreateBody,
      response: { 201: t.Object({ id: t.String(), },), 401: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Create location trait",
        description: "Create a location-scoped trait for an actor.",
        tags: ["Character Traits",],
      },
    },)
    .delete(`${prefix}/actors/:actorId/traits/location/:locationId/:traitName`, async (ctx,) => {
      const userId = await requireActorAccess(ctx, database,);
      if (userId instanceof Response) { return userId; }

      const { actorId, locationId, traitName, } = ctx.params as {
        actorId: string;
        locationId: string;
        traitName: string;
      };
      await traitsService.deleteLocationTrait(actorId, locationId, traitName,);
      return jsonNoContent();
    }, {
      params: ActorIdLocationTraitParams,
      response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Delete location trait",
        description: "Delete a location-scoped trait from an actor.",
        tags: ["Character Traits",],
      },
    },);
}

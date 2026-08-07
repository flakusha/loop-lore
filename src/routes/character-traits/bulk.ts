import { Elysia, t, } from "elysia";
import { TraitsService, } from "../../characters/services/traits-service";
import {
  ErrorResponse,
  Id,
  ListResponse,
  TraitResponse,
} from "../../validation/schemas";
import { checkActorOwnership, } from "../actor-auth";
import { HttpStatus, jsonError, jsonResponse, requireUserId, } from "../http-utils";
import type { HandlerOpts, } from "./types";

/**
 * Bulk Traits sub-plugin — aggregated trait lookup across all layers.
 */
export function bulkTraitsRoutes(opts: HandlerOpts,) {
  const { database, } = opts;
  const traitsService = TraitsService(database,);

  return (
    new Elysia({ name: "character-traits-bulk", },)
      .get("/api/actors/:actorId/traits", async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const { actorId, } = ctx.params;

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
        }
        const worldId = ctx.query.worldId as string | undefined;
        const locationId = ctx.query.locationId as string | undefined;

        const traits = await traitsService.getAllTraits(actorId, worldId, locationId,);
        return jsonResponse(traits,);
      }, {
        params: t.Object({ actorId: Id, },),
        response: {
          200: ListResponse(TraitResponse,),
          401: ErrorResponse,
          404: ErrorResponse,
        },
      },)
  );
}

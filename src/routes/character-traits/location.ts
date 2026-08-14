import { Elysia, t, } from "elysia";
import { TraitsService, } from "../../characters/services/traits-service";
import type { TranslatorFn, } from "../../i18n/types";
import {
  ErrorResponse,
  Id,
  ListResponse,
  LocationTraitCreateBody,
  LocationTraitUpdateBody,
  SuccessResponse,
  TraitResponse,
} from "../../validation/schemas";
import { checkActorOwnership, } from "../actor-auth";
import { HttpStatus, jsonCreated, jsonError, jsonNoContent, jsonResponse, requireUserId, } from "../http-utils";
import type { HandlerOpts, } from "./types";

/**
 * Location Traits (Layer 3) sub-plugin — CRUD for actor location-specific traits.
 */
export function locationTraitsRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;
  const traitsService = TraitsService(database,);

  return (
    new Elysia({ name: "character-traits-location", },)
      .get(prefix + "/actors/:actorId/traits/location/:locationId", async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const t = ctx.t as TranslatorFn | undefined;

        const { actorId, locationId, } = ctx.params;

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
        }
        const traits = await traitsService.getLocationTraits(actorId, locationId,);
        return jsonResponse(traits,);
      }, {
        params: t.Object({ actorId: Id, locationId: Id, },),
        response: {
          200: ListResponse(TraitResponse,),
          401: ErrorResponse,
          404: ErrorResponse,
        },
      },)
      .get(prefix + "/actors/:actorId/traits/location/:locationId/:traitName", async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const t = ctx.t as TranslatorFn | undefined;

        const { actorId, locationId, traitName, } = ctx.params;

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
        }
        const trait = await traitsService.getLocationTrait(actorId, locationId, traitName,);
        if (!trait) { return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },); }
        return jsonResponse(trait,);
      }, {
        params: t.Object({ actorId: Id, locationId: Id, traitName: t.String(), },),
        response: {
          200: TraitResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
      },)
      .post(prefix + "/actors/:actorId/traits/location/:locationId", async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const t = ctx.t as TranslatorFn | undefined;

        const { actorId, locationId, } = ctx.params;

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
        }
        const { trait_category, trait_name, value, bonus, penalty, effects, } = ctx.body;

        const traitId = await traitsService.createLocationTrait({
          actorId,
          locationId,
          category: trait_category,
          name: trait_name,
          value,
          bonus: bonus ?? 0,
          penalty: penalty ?? 0,
          effects: effects ?? "",
        },);
        return jsonCreated({ id: traitId, },);
      }, {
        params: t.Object({ actorId: Id, locationId: Id, },),
        body: LocationTraitCreateBody,
        response: {
          200: TraitResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
      },)
      .put(prefix + "/actors/:actorId/traits/location/:locationId/:traitName", async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const t = ctx.t as TranslatorFn | undefined;

        const { actorId, locationId, traitName, } = ctx.params;

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
        }
        const { value, bonus, penalty, effects, } = ctx.body;

        await traitsService.updateLocationTrait(actorId, locationId, {
          name: traitName,
          value,
          bonus: bonus ?? 0,
          penalty: penalty ?? 0,
          effects: effects ?? {},
        },);
        return jsonResponse({ ok: true, },);
      }, {
        params: t.Object({ actorId: Id, locationId: Id, traitName: t.String(), },),
        body: LocationTraitUpdateBody,
        response: {
          200: SuccessResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
      },)
      .delete(prefix + "/actors/:actorId/traits/location/:locationId/:traitName", async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const t = ctx.t as TranslatorFn | undefined;

        const { actorId, locationId, traitName, } = ctx.params;

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
        }
        await traitsService.deleteLocationTrait(actorId, locationId, traitName,);
        return jsonNoContent();
      }, {
        params: t.Object({ actorId: Id, locationId: Id, traitName: t.String(), },),
        response: {
          200: SuccessResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
      },)
  );
}

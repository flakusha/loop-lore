/**
 * Character Traits Routes
 *
 * API endpoints for managing character permanent traits (Layer 0),
 * world traits (Layer 2), and location traits (Layer 3).
 */
import { Elysia, t, } from "elysia";
import { TraitsService, } from "../characters/services/traits-service";
import type { TranslatorFn, } from "../i18n/types";
import {
  ActorIdParams,
  ErrorResponse,
  Id,
  ListResponse,
  LocationTraitCreateBody,
  LocationTraitUpdateBody,
  SuccessResponse,
  TraitCreateBody,
  TraitResponse,
  TraitUpdateBody,
  WorldTraitCreateBody,
} from "../validation/schemas";
import { checkActorOwnership, type HandlerOpts, } from "./actor-auth";
import { jsonCreated, jsonError, jsonNoContent, jsonResponse, requireUserId, } from "./http-utils";
import { HttpStatus, } from "./http-utils";

export function characterTraitsRoutes(opts: HandlerOpts,) {
  const { database, } = opts;
  const traitsService = new TraitsService(database,);

  return new Elysia({ name: "character-traits", },)
    // ── Permanent Traits (Layer 0) ──────────────────────────
    .get(
      "/api/actors/:actorId/traits/permanent",
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const t = ctx.t as TranslatorFn | undefined;

        const { actorId, } = ctx.params;

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
        }
        const traits = await traitsService.getPermanentTraits(actorId,);
        return jsonResponse(traits,);
      },
      {
        params: ActorIdParams,
        response: {
          200: ListResponse(TraitResponse,),
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "List permanent traits",
          description: "Get all permanent traits for an actor (Layer 0).",
          tags: ["Character Traits",],
        },
      },
    )
    .get(
      "/api/actors/:actorId/traits/permanent/:traitName",
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const t = ctx.t as TranslatorFn | undefined;

        const { actorId, traitName, } = ctx.params;

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
        }
        const trait = await traitsService.getPermanentTrait(actorId, traitName,);
        if (!trait) { return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },); }
        return jsonResponse(trait,);
      },
      {
        params: t.Object({ actorId: Id, traitName: t.String(), },),
        response: {
          200: TraitResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Get permanent trait",
          description: "Get a specific permanent trait by name.",
          tags: ["Character Traits",],
        },
      },
    )
    .post(
      "/api/actors/:actorId/traits/permanent",
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const t = ctx.t as TranslatorFn | undefined;

        const { actorId, } = ctx.params;

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
        }
        const { category, name, value, } = ctx.body;

        const traitId = await traitsService.createPermanentTrait({
          actorId,
          category,
          name,
          value,
        },);
        return jsonCreated({ id: traitId, },);
      },
      {
        params: t.Object({ actorId: Id, },),
        body: TraitCreateBody,
        response: {
          200: TraitResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Create permanent trait",
          description: "Create a new permanent trait for an actor.",
          tags: ["Character Traits",],
        },
      },
    )
    .put(
      "/api/actors/:actorId/traits/permanent/:traitName",
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const t = ctx.t as TranslatorFn | undefined;

        const { actorId, traitName, } = ctx.params;

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
        }
        const { value, } = ctx.body;

        await traitsService.updatePermanentTrait(actorId, {
          name: traitName,
          value,
        },);
        return jsonResponse({ ok: true, },);
      },
      {
        params: t.Object({ actorId: Id, traitName: t.String(), },),
        body: TraitUpdateBody,
        response: {
          200: SuccessResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Update permanent trait",
          description: "Update a permanent trait's value.",
          tags: ["Character Traits",],
        },
      },
    )
    .delete(
      "/api/actors/:actorId/traits/permanent/:traitName",
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const t = ctx.t as TranslatorFn | undefined;

        const { actorId, traitName, } = ctx.params;

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
        }
        await traitsService.deletePermanentTrait(actorId, traitName,);
        return jsonNoContent();
      },
      {
        params: t.Object({ actorId: Id, traitName: t.String(), },),
        response: {
          200: SuccessResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Delete permanent trait",
          description: "Delete a permanent trait.",
          tags: ["Character Traits",],
        },
      },
    )
    // ── World Traits (Layer 2) ──────────────────────────────
    .get(
      "/api/actors/:actorId/traits/world/:worldId",
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const t = ctx.t as TranslatorFn | undefined;

        const { actorId, worldId, } = ctx.params;

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
        }
        const traits = await traitsService.getWorldTraits(actorId, worldId,);
        return jsonResponse(traits,);
      },
      {
        params: t.Object({ actorId: Id, worldId: Id, },),
        response: {
          200: ListResponse(TraitResponse,),
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "List world traits",
          description: "Get all world-specific traits for an actor.",
          tags: ["Character Traits",],
        },
      },
    )
    .get(
      "/api/actors/:actorId/traits/world/:worldId/:traitName",
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const t = ctx.t as TranslatorFn | undefined;

        const { actorId, worldId, traitName, } = ctx.params;

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
        }
        const trait = await traitsService.getWorldTrait(actorId, worldId, traitName,);
        if (!trait) { return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },); }
        return jsonResponse(trait,);
      },
      {
        params: t.Object({ actorId: Id, worldId: Id, traitName: t.String(), },),
        response: {
          200: TraitResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Get world trait",
          description: "Get a specific world trait by name.",
          tags: ["Character Traits",],
        },
      },
    )
    .post(
      "/api/actors/:actorId/traits/world/:worldId",
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const t = ctx.t as TranslatorFn | undefined;

        const { actorId, worldId, } = ctx.params;

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
        }
        const { category, name, value, } = ctx.body;

        const traitId = await traitsService.createWorldTrait({
          actorId,
          worldId,
          category,
          name,
          value,
        },);
        return jsonCreated({ id: traitId, },);
      },
      {
        params: t.Object({ actorId: Id, worldId: Id, },),
        body: WorldTraitCreateBody,
        response: {
          200: TraitResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Create world trait",
          description: "Create a new world-specific trait for an actor.",
          tags: ["Character Traits",],
        },
      },
    )
    .put(
      "/api/actors/:actorId/traits/world/:worldId/:traitName",
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const t = ctx.t as TranslatorFn | undefined;

        const { actorId, worldId, traitName, } = ctx.params;

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
        }
        const { value, } = ctx.body;

        await traitsService.updateWorldTrait(actorId, worldId, {
          name: traitName,
          value,
        },);
        return jsonResponse({ ok: true, },);
      },
      {
        params: t.Object({ actorId: Id, worldId: Id, traitName: t.String(), },),
        body: TraitUpdateBody,
        response: {
          200: SuccessResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Update world trait",
          description: "Update a world-specific trait's value.",
          tags: ["Character Traits",],
        },
      },
    )
    .delete(
      "/api/actors/:actorId/traits/world/:worldId/:traitName",
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const t = ctx.t as TranslatorFn | undefined;

        const { actorId, worldId, traitName, } = ctx.params;

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
        }
        await traitsService.deleteWorldTrait(actorId, worldId, traitName,);
        return jsonNoContent();
      },
      {
        params: t.Object({ actorId: Id, worldId: Id, traitName: t.String(), },),
        response: {
          200: SuccessResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Delete world trait",
          description: "Delete a world-specific trait.",
          tags: ["Character Traits",],
        },
      },
    )
    // ── Location Traits (Layer 3) ───────────────────────────
    .get("/api/actors/:actorId/traits/location/:locationId", async (ctx: any,) => {
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
    .get("/api/actors/:actorId/traits/location/:locationId/:traitName", async (ctx: any,) => {
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
    .post("/api/actors/:actorId/traits/location/:locationId", async (ctx: any,) => {
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
    .put("/api/actors/:actorId/traits/location/:locationId/:traitName", async (ctx: any,) => {
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
    .delete("/api/actors/:actorId/traits/location/:locationId/:traitName", async (ctx: any,) => {
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
    // ── Bulk Traits ─────────────────────────────────────────
    .get("/api/actors/:actorId/traits", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

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
    },);
}

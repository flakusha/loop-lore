import { Elysia, t, } from "elysia";
import { TraitsService, } from "../../characters/services/traits-service";
import type { TranslatorFn, } from "../../i18n/types";
import {
  ActorIdParams,
  ErrorResponse,
  Id,
  ListResponse,
  SuccessResponse,
  TraitCreateBody,
  TraitResponse,
  TraitUpdateBody,
} from "../../validation/schemas";
import { checkActorOwnership, } from "../actor-auth";
import { HttpStatus, jsonCreated, jsonError, jsonNoContent, jsonResponse, requireUserId, } from "../http-utils";
import type { HandlerOpts, } from "./types";

/**
 * Permanent Traits (Layer 0) sub-plugin — CRUD for actor permanent traits.
 */
export function permanentTraitsRoutes(opts: HandlerOpts,) {
  const { database, } = opts;
  const traitsService = TraitsService(database,);

  return (
    new Elysia({ name: "character-traits-permanent", },)
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
  );
}

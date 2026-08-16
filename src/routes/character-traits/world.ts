// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { TraitsService, } from "../../characters/services/traits-service";
import type { TranslatorFn, } from "../../i18n/types";
import {
  ErrorResponse,
  Id,
  ListResponse,
  SuccessResponse,
  TraitResponse,
  TraitUpdateBody,
  WorldTraitCreateBody,
} from "../../validation/schemas";
import { checkActorOwnership, } from "../actor-auth";
import { HttpStatus, jsonCreated, jsonError, jsonNoContent, jsonResponse, requireUserId, } from "../http-utils";
import type { HandlerOpts, } from "./types";

/**
 * World Traits (Layer 2) sub-plugin — CRUD for actor world-specific traits.
 */
export function worldTraitsRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;
  const traitsService = TraitsService(database,);

  return (
    new Elysia({ name: "character-traits-world", },)
      .get(
        `${prefix}/actors/:actorId/traits/world/:worldId`,
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
        `${prefix}/actors/:actorId/traits/world/:worldId/:traitName`,
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
        `${prefix}/actors/:actorId/traits/world/:worldId`,
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
        `${prefix}/actors/:actorId/traits/world/:worldId/:traitName`,
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
        `${prefix}/actors/:actorId/traits/world/:worldId/:traitName`,
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
  );
}

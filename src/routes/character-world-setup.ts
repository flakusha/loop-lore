// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character World Setup Routes
 *
 * REST surface for the per-world character setup bundle
 * (`character_world_setup`). Scoped under `/actors/:actorId/world-setup/:worldId`.
 */
import { Elysia, t, } from "elysia";
import { CharacterWorldSetupService, } from "../characters/world-setup";
import {
  ErrorResponse,
  Id,
  SuccessResponse,
  WorldSetupResolvedResponse,
  WorldSetupResponse,
  WorldSetupUpsertBody,
} from "../validation/schemas";
import { checkActorOwnership, type HandlerOpts, } from "./actor-auth";
import { HttpStatus, jsonCreated, jsonError, jsonNoContent, jsonResponse, requireUserId, } from "./http-utils";

export function characterWorldSetupRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;
  const service = CharacterWorldSetupService(database,);

  return (
    new Elysia({ name: "character-world-setup", },)
      .get(
        `${prefix}/actors/:actorId/world-setup/:worldId`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const { actorId, worldId, } = ctx.params;

          if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
            return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, },);
          }
          const setup = await service.getWorldSetup(actorId, worldId,);
          if (!setup) { return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, },); }
          return jsonResponse(setup,);
        },
        {
          params: t.Object({ actorId: Id, worldId: Id, },),
          response: {
            200: WorldSetupResponse,
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Get character world setup",
            description: "Get the raw per-world setup bundle for an actor.",
            tags: ["Character World Setup",],
          },
        },
      )
      .get(
        `${prefix}/actors/:actorId/world-setup/:worldId/resolve`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const { actorId, worldId, } = ctx.params;

          if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
            return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, },);
          }
          const resolved = await service.resolveCharacterWorldSetup(actorId, worldId,);
          if (!resolved) { return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, },); }
          return jsonResponse(resolved,);
        },
        {
          params: t.Object({ actorId: Id, worldId: Id, },),
          response: {
            200: WorldSetupResolvedResponse,
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Resolve character world setup",
            description: "Merge base actor setup with the per-world setup overlay.",
            tags: ["Character World Setup",],
          },
        },
      )
      .put(
        `${prefix}/actors/:actorId/world-setup/:worldId`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const { actorId, worldId, } = ctx.params;
          const body = ctx.body;

          if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
            return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, },);
          }
          const setup = await service.upsertWorldSetup({
            actorId,
            worldId,
            startingInventory: body.startingInventory,
            loreEntries: body.loreEntries,
            backstory: body.backstory,
            scenarioOverride: body.scenarioOverride,
            systemPromptOverride: body.systemPromptOverride,
            initialState: body.initialState,
          },);
          return jsonCreated(setup,);
        },
        {
          params: t.Object({ actorId: Id, worldId: Id, },),
          body: WorldSetupUpsertBody,
          response: {
            201: WorldSetupResponse,
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Upsert character world setup",
            description: "Create or merge the per-world setup bundle for an actor.",
            tags: ["Character World Setup",],
          },
        },
      )
      .delete(
        `${prefix}/actors/:actorId/world-setup/:worldId`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const { actorId, worldId, } = ctx.params;

          if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
            return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, },);
          }
          const deleted = await service.deleteWorldSetup(actorId, worldId,);
          if (!deleted) { return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, },); }
          return jsonNoContent();
        },
        {
          params: t.Object({ actorId: Id, worldId: Id, },),
          response: {
            200: SuccessResponse,
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Delete character world setup",
            description: "Delete the per-world setup bundle for an actor.",
            tags: ["Character World Setup",],
          },
        },
      )
  );
}

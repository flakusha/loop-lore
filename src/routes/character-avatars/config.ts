// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { AvatarService, } from "../../characters/services/avatar-service";
import {
  ActorIdAvatarParams,
  AvatarConfigBody,
  AvatarResponse,
  ErrorResponse,
  SuccessResponse,
  WorldActorParams,
  WorldAvatarConfigBody,
} from "../../validation/schemas";
import { checkActorOwnership, } from "../actor-auth";
import { HttpStatus, jsonError, jsonResponse, requireUserId, } from "../http-utils";
import type { HandlerOpts, } from "./types";

/**
 * Avatar config sub-plugin — actor and world avatar-selection configuration.
 */
export function configRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;
  const avatarService = new AvatarService(database,);

  return (
    new Elysia({ name: "character-avatars-config", },)
      .get(`${prefix}/actors/:actorId/avatars/config`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const { actorId, } = ctx.params;

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({
            message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
            status: HttpStatus.NotFound,
          },);
        }
        const config = await avatarService.getAvatarConfig(actorId,);
        return jsonResponse(config,);
      }, {
        params: ActorIdAvatarParams,
        response: {
          200: AvatarResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Get avatar selection config",
          description: "Get the avatar selection configuration for an actor.",
          tags: ["Avatars",],
        },
      },)
      .put(`${prefix}/actors/:actorId/avatars/config`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const { actorId, } = ctx.params;

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({
            message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
            status: HttpStatus.NotFound,
          },);
        }

        const { selectionRule, weights, fallbackChain, } = ctx.body;

        await avatarService.upsertAvatarConfig(actorId, {
          selectionRule,
          weights,
          fallbackChain,
        },);
        return jsonResponse({ ok: true, },);
      }, {
        params: ActorIdAvatarParams,
        body: AvatarConfigBody,
        response: {
          200: SuccessResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Update avatar selection config",
          description: "Update the avatar selection configuration (rule, weights, fallback chain) for an actor.",
          tags: ["Avatars",],
        },
      },)
      .get(`${prefix}/worlds/:worldId/avatars/config/:actorId`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const { worldId, actorId, } = ctx.params;

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({
            message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
            status: HttpStatus.NotFound,
          },);
        }

        const config = await avatarService.getWorldAvatarConfig(actorId, worldId,);
        return jsonResponse(config,);
      }, {
        params: WorldActorParams,
        response: {
          200: AvatarResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Get world avatar config",
          description: "Get the world-specific avatar configuration override for an actor.",
          tags: ["Avatars",],
        },
      },)
      .put(`${prefix}/worlds/:worldId/avatars/config/:actorId`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const { worldId, actorId, } = ctx.params;

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({
            message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
            status: HttpStatus.NotFound,
          },);
        }

        const { selectionRuleOverride, weightsOverride, } = ctx.body;

        await avatarService.upsertWorldAvatarConfig(actorId, worldId, {
          selectionRuleOverride,
          weightsOverride,
        },);
        return jsonResponse({ ok: true, },);
      }, {
        params: WorldActorParams,
        body: WorldAvatarConfigBody,
        response: {
          200: SuccessResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Update world avatar config",
          description: "Update the world-specific avatar configuration override for an actor.",
          tags: ["Avatars",],
        },
      },)
  );
}

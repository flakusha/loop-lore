// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { unlinkAsset, } from "../../assets/service";
import { AvatarService, } from "../../characters/services/avatar-service";
import { AssetLinkEntity, } from "../../db/enums-content";
import {
  ActorIdAssetIdParams,
  ActorIdAvatarIdParams,
  ActorIdAvatarParams,
  AvatarCreateBody,
  AvatarResponse,
  AvatarUpdateBody,
  ErrorResponse,
  ListResponse,
  SuccessResponse,
} from "../../validation/schemas";
import { checkActorOwnership, } from "../actor-auth";
import { HttpStatus, jsonCreated, jsonError, jsonNoContent, jsonResponse, requireUserId, } from "../http-utils";
import type { HandlerOpts, } from "./types";

/**
 * Avatars CRUD sub-plugin — list/get/create/update/delete actor avatars.
 */
export function crudRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;
  const avatarService = new AvatarService(database,);

  return (
    new Elysia({ name: "character-avatars-crud", },)
      .get(`${prefix}/actors/:actorId/avatars`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const { actorId, } = ctx.params;

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({
            message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
            status: HttpStatus.NotFound,
          },);
        }
        const avatars = await avatarService.getAvatars(actorId,);
        return jsonResponse(avatars,);
      }, {
        params: ActorIdAvatarParams,
        response: {
          200: ListResponse(AvatarResponse,),
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "List actor avatars",
          description: "List all avatars for a given actor.",
          tags: ["Avatars",],
        },
      },)
      .get(`${prefix}/actors/:actorId/avatars/:avatarId`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const { actorId, avatarId, } = ctx.params;

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({
            message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
            status: HttpStatus.NotFound,
          },);
        }

        const avatar = await avatarService.getAvatar(avatarId,);
        if (!avatar) {
          return jsonError({
            message: ctx.t?.("characters.avatarNotFound",) ?? "Avatar not found",
            status: HttpStatus.NotFound,
          },);
        }
        return jsonResponse(avatar,);
      }, {
        params: ActorIdAvatarIdParams,
        response: {
          200: AvatarResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Get actor avatar",
          description: "Get a specific avatar by ID for a given actor.",
          tags: ["Avatars",],
        },
      },)
      .post(`${prefix}/actors/:actorId/avatars`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const { actorId, } = ctx.params;

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({
            message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
            status: HttpStatus.NotFound,
          },);
        }

        const { assetId, label, tags, isPrimary, sortOrder, } = ctx.body;

        const avatarId = await avatarService.createAvatar({
          actorId,
          assetId,
          label: label ?? "",
          tags: tags ?? {},
          isPrimary: isPrimary ?? false,
          sortOrder: sortOrder ?? 0,
        },);
        return jsonCreated({ id: avatarId, },);
      }, {
        params: ActorIdAvatarParams,
        body: AvatarCreateBody,
        response: {
          200: AvatarResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Create actor avatar",
          description: "Create a new avatar for an actor. Requires an assetId.",
          tags: ["Avatars",],
        },
      },)
      .put(`${prefix}/actors/:actorId/avatars/:avatarId`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const { actorId, avatarId, } = ctx.params;

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({
            message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
            status: HttpStatus.NotFound,
          },);
        }

        const { label, tags, isPrimary, sortOrder, } = ctx.body;

        await avatarService.updateAvatar(avatarId, {
          label,
          tags,
          isPrimary,
          sortOrder,
        },);
        return jsonResponse({ ok: true, },);
      }, {
        params: ActorIdAvatarIdParams,
        body: AvatarUpdateBody,
        response: {
          200: SuccessResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Update actor avatar",
          description: "Update an existing avatar's label, tags, primary flag, or sort order.",
          tags: ["Avatars",],
        },
      },)
      .delete(`${prefix}/actors/:actorId/avatars/:avatarId`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const { actorId, avatarId, } = ctx.params;

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({
            message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
            status: HttpStatus.NotFound,
          },);
        }

        await avatarService.deleteAvatar(avatarId,);
        return jsonNoContent();
      }, {
        params: ActorIdAvatarIdParams,
        response: {
          200: SuccessResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Delete actor avatar",
          description: "Delete an avatar by ID.",
          tags: ["Avatars",],
        },
      },)
      .delete(`${prefix}/actors/:actorId/assets/:assetId`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const { actorId, assetId, } = ctx.params;

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({
            message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
            status: HttpStatus.NotFound,
          },);
        }

        // Remove the gallery asset_links entry linking this asset to the character.
        // The asset itself is preserved (no deleteAsset).
        await unlinkAsset({
          database,
          assetId,
          entityType: AssetLinkEntity.Actor,
          entityId: actorId,
        },);
        return jsonNoContent();
      }, {
        params: ActorIdAssetIdParams,
        response: {
          200: SuccessResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Unlink asset from actor",
          description:
            "Remove the gallery asset_links entry for an asset linked to this character. The asset itself is preserved.",
          tags: ["Avatars",],
        },
      },)
  );
}

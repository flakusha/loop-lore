// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character Avatar Routes
 *
 * API endpoints for managing character avatars (CRUD, selection, config).
 */
import { Elysia, t, } from "elysia";
import { AvatarService, } from "../characters/services/avatar-service";
import {
  ActorIdAvatarIdParams,
  ActorIdParams,
  AvatarConfigBody,
  AvatarCreateBody,
  AvatarResponse,
  AvatarSelectBody,
  AvatarUpdateBody,
  ErrorResponse,
  SuccessResponse,
} from "../validation/schemas";
import { type HandlerOpts, requireActorAccess, } from "./actor-auth";
import { HttpStatus, jsonCreated, jsonError, jsonNoContent, jsonResponse, } from "./http-utils";

const AvatarListResponse = t.Array(AvatarResponse,);

export function characterAvatarsRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;
  const avatarService = new AvatarService(database,);

  return new Elysia({ name: "character-avatars", },)
    // ── List avatars ─────────────────────────────────────────────

    .get(`${prefix}/actors/:actorId/avatars`, async (ctx: any,) => {
      const userId = await requireActorAccess(ctx, database,);
      if (userId instanceof Response) { return userId; }

      const { actorId, } = ctx.params;
      const avatars = await avatarService.getAvatars(actorId,);
      return jsonResponse(avatars,);
    }, {
      params: ActorIdParams,
      response: {
        200: AvatarListResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "List avatars",
        description: "List all avatars for a character.",
        tags: ["Character Avatars",],
      },
    },)
    // ── Create avatar ───────────────────────────────────────────

    .post(`${prefix}/actors/:actorId/avatars`, async (ctx: any,) => {
      const userId = await requireActorAccess(ctx, database,);
      if (userId instanceof Response) { return userId; }

      const { actorId, } = ctx.params;
      const { emotion, mood, image_url, } = ctx.body ?? {};

      // image_url is used as the assetId source in this route pattern
      if (!image_url) {
        return jsonError({
          message: "image_url is required",
          status: HttpStatus.BadRequest,
        },);
      }

      const avatarId = await avatarService.createAvatar({
        actorId,
        assetId: image_url as string,
        label: (emotion as string | undefined) ?? (mood as string | undefined) ?? "default",
        tags: {
          emotion: emotion as string | undefined,
          mood: mood as string | undefined,
        },
        isPrimary: false,
      },);
      return jsonCreated({ id: avatarId, },);
    }, {
      params: ActorIdParams,
      body: AvatarCreateBody,
      response: {
        201: t.Object({ id: t.String(), },),
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Create avatar",
        description: "Create a new avatar for a character.",
        tags: ["Character Avatars",],
      },
    },)
    // ── Update avatar ────────────────────────────────────────────

    .put(`${prefix}/actors/:actorId/avatars/:avatarId`, async (ctx: any,) => {
      const userId = await requireActorAccess(ctx, database,);
      if (userId instanceof Response) { return userId; }

      const { avatarId, } = ctx.params;
      const { emotion, mood, } = ctx.body ?? {};

      await avatarService.updateAvatar(avatarId, {
        label: (emotion as string | undefined) ?? (mood as string | undefined),
        tags: {
          emotion: emotion as string | undefined,
          mood: mood as string | undefined,
        },
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
        summary: "Update avatar",
        description: "Update an avatar's emotion/mood tags.",
        tags: ["Character Avatars",],
      },
    },)
    // ── Delete avatar ───────────────────────────────────────────

    .delete(`${prefix}/actors/:actorId/avatars/:avatarId`, async (ctx: any,) => {
      const userId = await requireActorAccess(ctx, database,);
      if (userId instanceof Response) { return userId; }

      const { avatarId, } = ctx.params;
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
        summary: "Delete avatar",
        description: "Delete an avatar from a character.",
        tags: ["Character Avatars",],
      },
    },)
    // ── Select avatar ────────────────────────────────────────────

    .post(`${prefix}/actors/:actorId/avatars/select`, async (ctx: any,) => {
      const userId = await requireActorAccess(ctx, database,);
      if (userId instanceof Response) { return userId; }

      const { actorId, } = ctx.params;
      const { avatar_id, } = ctx.body ?? {};

      if (!avatar_id) {
        return jsonError({
          message: "avatar_id is required",
          status: HttpStatus.BadRequest,
        },);
      }

      const avatar = await avatarService.getAvatar(avatar_id as string,);
      if (!avatar || avatar.actorId !== actorId) {
        return jsonError({
          message: "Avatar not found",
          status: HttpStatus.NotFound,
        },);
      }

      return jsonResponse(avatar,);
    }, {
      params: ActorIdParams,
      body: AvatarSelectBody,
      response: {
        200: AvatarResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Select avatar",
        description: "Validate that an avatar belongs to the actor.",
        tags: ["Character Avatars",],
      },
    },)
    // ── Avatar config ──────────────────────────────────────────

    .get(`${prefix}/actors/:actorId/avatars/config`, async (ctx: any,) => {
      const userId = await requireActorAccess(ctx, database,);
      if (userId instanceof Response) { return userId; }

      const { actorId, } = ctx.params;
      const config = await avatarService.getAvatarConfig(actorId,);
      if (!config) {
        return jsonError({
          message: "Avatar config not found",
          status: HttpStatus.NotFound,
        },);
      }
      return jsonResponse(config,);
    }, {
      params: ActorIdParams,
      response: {
        200: t.Any(),
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Get avatar config",
        description: "Get the avatar selection configuration for a character.",
        tags: ["Character Avatars",],
      },
    },)
    .put(`${prefix}/actors/:actorId/avatars/config`, async (ctx: any,) => {
      const userId = await requireActorAccess(ctx, database,);
      if (userId instanceof Response) { return userId; }

      const { actorId, } = ctx.params;
      const { selection_rule_override, } = ctx.body ?? {};

      const configId = await avatarService.upsertAvatarConfig(actorId, {
        selectionRule: selection_rule_override as any,
      },);
      return jsonCreated({ id: configId, },);
    }, {
      params: ActorIdParams,
      body: AvatarConfigBody,
      response: {
        201: t.Object({ id: t.String(), },),
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Update avatar config",
        description: "Create or update the avatar selection configuration for a character.",
        tags: ["Character Avatars",],
      },
    },);
}

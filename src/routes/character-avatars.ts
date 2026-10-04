// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character Avatar Routes
 *
 * API endpoints for managing character avatars (CRUD, selection, config).
 */
import { Elysia, t, } from "elysia";
import { requireAssetOwner, } from "../assets/controller";
import { AvatarService, } from "../characters/services/avatar-service";
import {
  ActorIdAvatarIdParams,
  ActorIdParams,
  AvatarCreateBody,
  AvatarResponse,
  AvatarSelectBody,
  AvatarUpdateBody,
  ErrorResponse,
  SuccessResponse,
} from "../validation/schemas";
import { type HandlerOpts, requireActorAccess, } from "./actor-auth";
import { characterAvatarsConfigPlugin, } from "./character-avatars-config";
import { characterAvatarsExtraPlugin, } from "./character-avatars-extra";
import { HttpStatus, jsonCreated, jsonError, jsonNoContent, jsonResponse, } from "./http-utils";

const AvatarListResponse = t.Array(AvatarResponse,);

/**
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { actors: { ":actorId": { ...; }; }; }; } & ... 5 more ... & { ...; }, { ...; }, { ...; }>}
 */
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

      // requireActorAccess only proves the caller owns the ACTOR. image_url is
      // caller-supplied and createAvatar links it onto the actor without ever
      // consulting the asset row, so owning an actor must not grant the right to
      // link somebody else's asset. Gate the asset at the same layer as the
      // unlink route in character-avatars-extra. requireAssetOwner answers
      // "missing" and "not yours" with the same 404, so this leaks no existence
      // oracle, and it keeps the raw SQLite FK error off the wire for unknown ids.
      const ownedAsset = await requireAssetOwner(database, image_url as string, userId,);
      if (ownedAsset instanceof Response) { return ownedAsset; }

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
    // Extracted to stay under the 250L gate; also mounts the world-scoped
    // overrides that only existed in the shadowed directory.

    .use(characterAvatarsConfigPlugin(opts, avatarService, prefix,),)
    .use(characterAvatarsExtraPlugin(opts, prefix,),);
}

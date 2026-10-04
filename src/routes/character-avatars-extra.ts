// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character Avatar Routes — the surface that was only reachable from the
 * shadowed `src/routes/character-avatars/` directory.
 *
 * `src/routes/character-avatars.ts` shadows that directory at module
 * resolution, so every route below 404'd in production even though the
 * directory shipped handlers for them. They are mounted from this module
 * instead. The name carries an `-extra` suffix on purpose: a bare
 * `character-avatars/` directory must never sit beside the flat
 * `character-avatars.ts` file, or the shadowing recurs.
 *
 * Contains: single-avatar read, asset unlink, and the world-scoped
 * avatar-config overrides. The overlapping CRUD/select/config routes stay
 * in the flat file — registering them here too would double-register.
 */
import { Elysia, } from "elysia";
import { unlinkAsset, } from "../assets/service";
import { AvatarService, } from "../characters/services/avatar-service";
import { AvatarSelectionRule, } from "../db/enums";
import { AssetLinkEntity, } from "../db/enums-content";
import {
  ActorIdAssetIdParams,
  ActorIdAvatarIdParams,
  AvatarResponse,
  ErrorResponse,
  SuccessResponse,
  WorldActorParams,
  WorldAvatarConfigBody,
} from "../validation/schemas";
import { type HandlerOpts, requireActorAccess, } from "./actor-auth";
import { HttpStatus, jsonError, jsonNoContent, jsonResponse, } from "./http-utils";
import { requireWorldAccess, requireWorldOwner, } from "./worlds/access";

/**
 * Single-avatar read, asset unlink, and world avatar-config routes.
 * @param opts
 * @param prefix
 * @returns {Elysia}
 */
export function characterAvatarsExtraPlugin(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;
  const avatarService = new AvatarService(database,);

  return new Elysia({ name: "character-avatars-extra", },)
    // ── Get avatar ───────────────────────────────────────────────

    .get(`${prefix}/actors/:actorId/avatars/:avatarId`, async (ctx: any,) => {
      const userId = await requireActorAccess(ctx, database,);
      if (userId instanceof Response) { return userId; }

      const { actorId, avatarId, } = ctx.params;
      const avatar = await avatarService.getAvatar(avatarId,);
      // requireActorAccess only proves the caller owns the actor in the PATH.
      // The avatar row carries its own actor, so a caller who owns any actor
      // could read someone else's avatar by guessing its id (IDOR). Deny
      // unless the row actually belongs to the actor that was authorized.
      if (!avatar || avatar.actorId !== actorId) {
        return jsonError({ message: "Avatar not found", status: HttpStatus.NotFound, },);
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
    // ── Unlink asset from actor ──────────────────────────────────
    // The character gallery's "Unlink" button calls this. Only the
    // asset_links row is dropped; the asset itself is preserved.

    .delete(`${prefix}/actors/:actorId/assets/:assetId`, async (ctx: any,) => {
      const userId = await requireActorAccess(ctx, database,);
      if (userId instanceof Response) { return userId; }

      const { actorId, assetId, } = ctx.params;
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
          "Remove the gallery asset link for an asset linked to this character. The asset itself is preserved.",
        tags: ["Avatars",],
      },
    },)
    // ── World avatar config ──────────────────────────────────────

    .get(`${prefix}/worlds/:worldId/avatars/config/:actorId`, async (ctx: any,) => {
      const userId = await requireActorAccess(ctx, database,);
      if (userId instanceof Response) { return userId; }

      const { worldId, actorId, } = ctx.params;
      // requireActorAccess only proves ownership of the ACTOR. These rows are
      // scoped to a world too, so gate on the world as well: actor ownership
      // alone let any caller read another tenant's world-scoped config.
      const worldErr = await requireWorldAccess(database, worldId, userId, ctx.userRole as string | null,);
      if (worldErr) { return worldErr; }

      const config = await avatarService.getWorldAvatarConfig(actorId, worldId,);
      if (!config) {
        return jsonError({ message: "World avatar config not found", status: HttpStatus.NotFound, },);
      }

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
      const userId = await requireActorAccess(ctx, database,);
      if (userId instanceof Response) { return userId; }

      const { worldId, actorId, } = ctx.params;
      const { selection_rule_override, } = ctx.body ?? {};

      // Mutation: world ownership, not actor ownership, is the gate. Without
      // this any caller who owned the actor could write into a world they do
      // not belong to.
      const worldErr = await requireWorldOwner(database, worldId, userId, ctx.userRole as string | null,);
      if (worldErr) { return worldErr; }

      // The body schema types this as a free string; an unrecognised rule
      // would persist and silently degrade every later avatar selection
      // (calculateAvatarScore has no default branch), so reject it here.
      const RULES: string[] = Object.values(AvatarSelectionRule,);
      if (selection_rule_override !== undefined && !RULES.includes(selection_rule_override,)) {
        return jsonError({
          message: `selection_rule_override must be one of: ${RULES.join(", ",)}`,
          status: HttpStatus.BadRequest,
        },);
      }

      await avatarService.upsertWorldAvatarConfig(actorId, worldId, {
        selectionRuleOverride: selection_rule_override as AvatarSelectionRule | undefined,
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
    },);
}

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character Avatar Routes — per-actor avatar-selection configuration.
 *
 * Split out of the flat `character-avatars.ts` to keep that file under the
 * 250L size gate. Suffix-named for the same reason as `character-avatars-extra`:
 * no `character-avatars/` directory may sit beside `character-avatars.ts`.
 */
import { Elysia, t, } from "elysia";
import type { AvatarService, } from "../characters/services/avatar-service";
import {
  ActorIdParams,
  AvatarConfigBody,
  ErrorResponse,
} from "../validation/schemas";
import { type HandlerOpts, requireActorAccess, } from "./actor-auth";
import { HttpStatus, jsonCreated, jsonError, jsonResponse, } from "./http-utils";

/**
 * GET/PUT the avatar selection configuration for one actor.
 * @param opts
 * @param avatarService
 * @param prefix
 * @returns {Elysia}
 */
export function characterAvatarsConfigPlugin(
  opts: HandlerOpts,
  avatarService: AvatarService,
  prefix: string,
) {
  const { database, } = opts;

  return new Elysia({ name: "character-avatars-config", },)
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

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { SeductionService, } from "../../rpg/seduction/service";
import type { ReputationTier, } from "../../schemas";
import { jsonError, jsonResponse, requireUserId, } from "../http-utils";
import {
  log,
  nsfwAccessErrorResponse,
  requireNsfwActorAccess,
  requireNsfwRouteAccess,
} from "./shared";
import type { HandlerOpts, } from "./types";

/**
 * @param opts
 * @param prefix
 */
export function seductionRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, config, } = opts;
  const seductionService = new SeductionService(database,);

  return (
    new Elysia({ name: "nsfw-seduction", },)
      .get(
        `${prefix}/nsfw/desire/:actorId`,
        async (ctx: any,) => {
          const auth = await requireNsfwActorAccess(database, ctx.params.actorId, ctx,);
          if (typeof auth !== "string") { return auth; }
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const access = await requireNsfwRouteAccess(database, config, userId,);
          if (!access.ok) { return nsfwAccessErrorResponse(access.reason,); }
          try {
            const profile = await seductionService.getDesireProfile(ctx.params.actorId,);
            return jsonResponse(profile,);
          } catch (error) {
            log().error("Failed to get desire profile", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      .put(
        `${prefix}/nsfw/desire/:actorId`,
        async (ctx: any,) => {
          const auth = await requireNsfwActorAccess(database, ctx.params.actorId, ctx,);
          if (typeof auth !== "string") { return auth; }
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const access = await requireNsfwRouteAccess(database, config, userId,);
          if (!access.ok) { return nsfwAccessErrorResponse(access.reason,); }
          try {
            const body = ctx.body as Record<string, unknown>;
            const success = await seductionService.updateDesireProfile(
              ctx.params.actorId,
              body,
            );
            return jsonResponse({ success, },);
          } catch (error) {
            log().error("Failed to update desire profile", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      .get(
        `${prefix}/nsfw/skills/:actorId`,
        async (ctx: any,) => {
          const auth = await requireNsfwActorAccess(database, ctx.params.actorId, ctx,);
          if (typeof auth !== "string") { return auth; }
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const access = await requireNsfwRouteAccess(database, config, userId,);
          if (!access.ok) { return nsfwAccessErrorResponse(access.reason,); }
          try {
            const skills = await seductionService.getActorSkills(ctx.params.actorId,);
            return jsonResponse(skills,);
          } catch (error) {
            log().error("Failed to get seduction skills", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      .post(
        `${prefix}/nsfw/seduction/attempt`,
        async (ctx: any,) => {
          try {
            const userId = requireUserId(ctx,);
            if (typeof userId !== "string") { return userId; }
            const body = ctx.body as Record<string, unknown>;
            const chatId = (body.chatId as string) ?? null;
            const actorId = (body.actorId as string) ?? "";
            const targetId = (body.targetId as string) ?? "";

            const ownership = await requireNsfwActorAccess(database, actorId, ctx,);
            if (typeof ownership !== "string") { return ownership; }

            const consent = await requireNsfwRouteAccess(database, config, userId, {
              chatId,
              actorId,
            },);
            if (!consent.ok) { return nsfwAccessErrorResponse(consent.reason,); }

            const result = await seductionService.attemptSeduction({
              database,
              actorId,
              targetId,
              skillCategory: body.skillCategory as any,
              approach: body.approach as string,
              worldId: (body.worldId as string) ?? null,
              reputationTier: (body.reputationTier as ReputationTier) ?? undefined,
            },);
            return jsonResponse(result,);
          } catch (error) {
            log().error("Failed to attempt seduction", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      .get(
        `${prefix}/nsfw/arousal/:actorId`,
        async (ctx: any,) => {
          const auth = await requireNsfwActorAccess(database, ctx.params.actorId, ctx,);
          if (typeof auth !== "string") { return auth; }
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const access = await requireNsfwRouteAccess(database, config, userId,);
          if (!access.ok) { return nsfwAccessErrorResponse(access.reason,); }
          try {
            const worldId = (ctx.query.worldId as string) ?? null;
            const arousal = await seductionService.getArousal(ctx.params.actorId, worldId,);
            return jsonResponse(arousal,);
          } catch (error) {
            log().error("Failed to get arousal state", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      .post(
        `${prefix}/nsfw/arousal/:actorId`,
        async (ctx: any,) => {
          const auth = await requireNsfwActorAccess(database, ctx.params.actorId, ctx,);
          if (typeof auth !== "string") { return auth; }
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const access = await requireNsfwRouteAccess(database, config, userId,);
          if (!access.ok) { return nsfwAccessErrorResponse(access.reason,); }
          try {
            const body = ctx.body as Record<string, unknown>;
            const newLevel = await seductionService.modifyArousal(
              ctx.params.actorId,
              body.delta as number,
              (body.worldId as string) ?? null,
              body.source as string | undefined,
            );
            return jsonResponse({ level: newLevel, },);
          } catch (error) {
            log().error("Failed to modify arousal", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
  );
}

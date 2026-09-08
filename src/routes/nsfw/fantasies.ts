// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { FantasyService, } from "../../rpg/fantasies/service";
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
export function fantasyRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, config, } = opts;
  const fantasyService = new FantasyService(database,);

  return (
    new Elysia({ name: "nsfw-fantasies", },)
      .get(
        `${prefix}/nsfw/fantasies/:actorId`,
        async (ctx: any,) => {
          const auth = await requireNsfwActorAccess(database, ctx.params.actorId, ctx,);
          if (typeof auth !== "string") { return auth; }
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const access = await requireNsfwRouteAccess(database, config, userId,);
          if (!access.ok) { return nsfwAccessErrorResponse(access.reason,); }
          try {
            const fantasies = await fantasyService.getActorFantasies(ctx.params.actorId,);
            return jsonResponse(fantasies,);
          } catch (error) {
            log().error("Failed to get fantasies", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      .post(
        `${prefix}/nsfw/fantasies`,
        async (ctx: any,) => {
          try {
            const userId = requireUserId(ctx,);
            if (typeof userId !== "string") { return userId; }
            const body = ctx.body as Record<string, unknown>;
            const actorId = (body.actorId as string) ?? "";
            const chatId = (body.chatId as string) ?? null;

            const ownership = await requireNsfwActorAccess(database, actorId, ctx,);
            if (typeof ownership !== "string") { return ownership; }

            const consent = await requireNsfwRouteAccess(database, config, userId, {
              chatId,
              actorId,
            },);
            if (!consent.ok) { return nsfwAccessErrorResponse(consent.reason,); }

            const fantasy = await fantasyService.createFantasy({
              database,
              actorId,
              name: body.name as string,
              category: body.category as any,
              intensity: body.intensity as any,
              discoveredThrough: body.discoveredThrough as string | undefined,
            },);
            return jsonResponse(fantasy,);
          } catch (error) {
            log().error("Failed to create fantasy", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      .post(
        `${prefix}/nsfw/fantasies/discover`,
        async (ctx: any,) => {
          try {
            const userId = requireUserId(ctx,);
            if (typeof userId !== "string") { return userId; }
            const body = ctx.body as Record<string, unknown>;
            const actorId = (body.actorId as string) ?? "";
            const chatId = (body.chatId as string) ?? null;

            const ownership = await requireNsfwActorAccess(database, actorId, ctx,);
            if (typeof ownership !== "string") { return ownership; }

            const consent = await requireNsfwRouteAccess(database, config, userId, {
              chatId,
              actorId,
            },);
            if (!consent.ok) { return nsfwAccessErrorResponse(consent.reason,); }

            const result = await fantasyService.attemptDiscovery(
              actorId,
              body.context as string,
              (body.discoveryChance as number) ?? 0.1,
            );
            return jsonResponse(result,);
          } catch (error) {
            log().error("Failed to discover fantasy", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      .post(
        `${prefix}/nsfw/fantasies/:id/explore`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const access = await requireNsfwRouteAccess(database, config, userId,);
          if (!access.ok) { return nsfwAccessErrorResponse(access.reason,); }
          try {
            const body = ctx.body as Record<string, unknown>;
            const success = await fantasyService.recordExploration(
              ctx.params.id,
              body.feeling as string | undefined,
            );
            return jsonResponse({ success, },);
          } catch (error) {
            log().error("Failed to record exploration", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
  );
}

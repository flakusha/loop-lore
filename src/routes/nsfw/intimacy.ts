// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { IntimacyService, } from "../../rpg/intimacy/service";
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
export function intimacyRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, config, } = opts;
  const intimacyService = new IntimacyService(database,);

  return (
    new Elysia({ name: "nsfw-intimacy", },)
      .get(
        `${prefix}/nsfw/intimacy/:actorId/:targetId`,
        async (ctx: any,) => {
          const auth = await requireNsfwActorAccess(database, ctx.params.actorId, ctx,);
          if (typeof auth !== "string") { return auth; }
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const access = await requireNsfwRouteAccess(database, config, userId,);
          if (!access.ok) { return nsfwAccessErrorResponse(access.reason,); }
          try {
            const worldId = (ctx.query.worldId as string) ?? null;
            const pair = await intimacyService.getPair(
              ctx.params.actorId,
              ctx.params.targetId,
              worldId,
            );
            return jsonResponse(pair,);
          } catch (error) {
            log().error("Failed to get intimacy pair", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      .get(
        `${prefix}/nsfw/intimacy/:actorId`,
        async (ctx: any,) => {
          const auth = await requireNsfwActorAccess(database, ctx.params.actorId, ctx,);
          if (typeof auth !== "string") { return auth; }
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const access = await requireNsfwRouteAccess(database, config, userId,);
          if (!access.ok) { return nsfwAccessErrorResponse(access.reason,); }
          try {
            const worldId = (ctx.query.worldId as string) ?? undefined;
            const pairs = await intimacyService.getActorPairs(
              ctx.params.actorId,
              worldId,
            );
            return jsonResponse(pairs,);
          } catch (error) {
            log().error("Failed to get actor pairs", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      .post(
        `${prefix}/nsfw/intimacy/action`,
        async (ctx: any,) => {
          try {
            const userId = requireUserId(ctx,);
            if (typeof userId !== "string") { return userId; }
            const body = ctx.body as Record<string, unknown>;
            const chatId = (body.chatId as string) ?? null;
            const actorId = (body.actorId as string) ?? "";
            const targetActorId = (body.targetActorId as string) ?? "";

            const ownership = await requireNsfwActorAccess(database, actorId, ctx,);
            if (typeof ownership !== "string") { return ownership; }

            const consent = await requireNsfwRouteAccess(database, config, userId, {
              chatId,
              actorId,
            },);
            if (!consent.ok) { return nsfwAccessErrorResponse(consent.reason,); }

            const result = await intimacyService.applyAction({
              database,
              actorId,
              targetActorId,
              worldId: (body.worldId as string) ?? null,
              action: {
                id: body.actionId as string,
                name: body.actionName as string,
                type: body.actionType as any,
                delta: body.delta as number,
                minIntimacy: (body.minIntimacy as number) ?? 0,
                requiresConsent: (body.requiresConsent as boolean) ?? false,
              },
              context: body.context as string | undefined,
            },);
            return jsonResponse(result,);
          } catch (error) {
            log().error("Failed to apply intimacy action", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
  );
}

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { EncounterService, } from "../../rpg/encounters/service";
import { LocationNsfwService, } from "../../rpg/location-nsfw/service";
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
export function encounterRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, config, } = opts;
  const encounterService = new EncounterService(database,);
  const locationNsfwService = new LocationNsfwService(database,);

  return (
    new Elysia({ name: "nsfw-encounters", },)
      .post(
        `${prefix}/nsfw/encounters`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          try {
            const body = ctx.body as Record<string, unknown>;
            const actorId = (body.actorId as string) ?? "";
            const chatId = (body.chatId as string) ?? null;
            const locationId = (body.locationId as string) ?? null;

            const ownership = await requireNsfwActorAccess(database, actorId, ctx,);
            if (typeof ownership !== "string") { return ownership; }

            const access = await requireNsfwRouteAccess(database, config, userId, {
              chatId,
              actorId,
            },);
            if (!access.ok) { return nsfwAccessErrorResponse(access.reason,); }

            // N3: location must be suitable for NSFW encounters (privacy).
            if (locationId) {
              const suitable = await locationNsfwService.isSuitableForEncounter(locationId,);
              if (!suitable.suitable) {
                return jsonError(`Location not suitable for NSFW encounter: ${suitable.reason ?? "unknown"}`, 400,);
              }
            }

            const encounter = await encounterService.createEncounter({
              database,
              worldId: (body.worldId as string) ?? null,
              locationId,
              encounterType: body.encounterType as any,
              intensity: body.intensity as any,
              narrativeStyle: body.narrativeStyle as any,
              participants: body.participants as string[],
              contentTags: body.contentTags as string[] | undefined,
            },);
            return jsonResponse(encounter,);
          } catch (error) {
            log().error("Failed to create encounter", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      .get(
        `${prefix}/nsfw/encounters/:id`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const access = await requireNsfwRouteAccess(database, config, userId,);
          if (!access.ok) { return nsfwAccessErrorResponse(access.reason,); }
          try {
            const encounter = await encounterService.getEncounter(ctx.params.id,);
            if (!encounter) {
              return jsonError("Encounter not found", 404,);
            }
            return jsonResponse(encounter,);
          } catch (error) {
            log().error("Failed to get encounter", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      .post(
        `${prefix}/nsfw/encounters/:id/advance`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const access = await requireNsfwRouteAccess(database, config, userId,);
          if (!access.ok) { return nsfwAccessErrorResponse(access.reason,); }
          try {
            const result = await encounterService.advancePhase(ctx.params.id,);
            return jsonResponse(result,);
          } catch (error) {
            log().error("Failed to advance encounter", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      .get(
        `${prefix}/nsfw/encounters/world/:worldId`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const access = await requireNsfwRouteAccess(database, config, userId,);
          if (!access.ok) { return nsfwAccessErrorResponse(access.reason,); }
          try {
            const encounters = await encounterService.listEncounters(ctx.params.worldId,);
            return jsonResponse(encounters,);
          } catch (error) {
            log().error("Failed to list encounters", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
  );
}

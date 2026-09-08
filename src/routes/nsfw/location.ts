// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { LocationNsfwService, } from "../../rpg/location-nsfw/service";
import { jsonError, jsonResponse, requireUserId, } from "../http-utils";
import {
  log,
  nsfwAccessErrorResponse,
  requireNsfwRouteAccess,
} from "./shared";
import type { HandlerOpts, } from "./types";

/**
 * @param opts
 * @param prefix
 */
export function locationRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, config, } = opts;
  const locationService = new LocationNsfwService(database,);

  return (
    new Elysia({ name: "nsfw-location", },)
      .get(
        `${prefix}/nsfw/location/:locationId`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const access = await requireNsfwRouteAccess(database, config, userId,);
          if (!access.ok) { return nsfwAccessErrorResponse(access.reason,); }
          try {
            const configObj = await locationService.getConfig(ctx.params.locationId,);
            return jsonResponse(configObj,);
          } catch (error) {
            log().error("Failed to get location config", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      .put(
        `${prefix}/nsfw/location/:locationId`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const access = await requireNsfwRouteAccess(database, config, userId,);
          if (!access.ok) { return nsfwAccessErrorResponse(access.reason,); }
          try {
            const body = ctx.body as Record<string, unknown>;
            const success = await locationService.updateConfig(
              ctx.params.locationId,
              body,
            );
            return jsonResponse({ success, },);
          } catch (error) {
            log().error("Failed to update location config", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
  );
}

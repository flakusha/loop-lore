import { Elysia, } from "elysia";
import { LocationNsfwService, } from "../../rpg/location-nsfw/service";
import { jsonError, jsonResponse, requireUserId, } from "../http-utils";
import { log, } from "./shared";
import type { HandlerOpts, } from "./types";

export function locationRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;
  const locationService = new LocationNsfwService(database,);

  return (
    new Elysia({ name: "nsfw-location", },)
      .get(
        `${prefix}/nsfw/location/:locationId`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          try {
            const config = await locationService.getConfig(ctx.params.locationId,);
            return jsonResponse(config,);
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

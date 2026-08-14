import { Elysia, } from "elysia";
import { BodySystemService, } from "../../rpg/body-systems/service";
import { jsonError, jsonResponse, } from "../http-utils";
import { log, requireActorAccess, } from "./shared";
import type { HandlerOpts, } from "./types";

export function bodyRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;
  const bodyService = new BodySystemService(database,);

  return (
    new Elysia({ name: "nsfw-body", },)
      .get(
        `${prefix}/nsfw/body/:actorId`,
        async (ctx: any,) => {
          const auth = await requireActorAccess(database, ctx.params.actorId, ctx,);
          if (typeof auth !== "string") { return auth; }
          try {
            const profile = await bodyService.getProfile(ctx.params.actorId,);
            return jsonResponse(profile,);
          } catch (error) {
            log().error("Failed to get body profile", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
      .put(
        `${prefix}/nsfw/body/:actorId`,
        async (ctx: any,) => {
          const auth = await requireActorAccess(database, ctx.params.actorId, ctx,);
          if (typeof auth !== "string") { return auth; }
          try {
            const body = ctx.body as Record<string, unknown>;
            const success = await bodyService.updateProfile(
              ctx.params.actorId,
              body,
            );
            return jsonResponse({ success, },);
          } catch (error) {
            log().error("Failed to update body profile", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
      )
  );
}

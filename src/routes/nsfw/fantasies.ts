import { Elysia, } from "elysia";
import { FantasyService, } from "../../rpg/fantasies/service";
import { jsonError, jsonResponse, requireUserId, } from "../http-utils";
import { log, requireActorAccess, } from "./shared";
import type { HandlerOpts, } from "./types";

export function fantasyRoutes(opts: HandlerOpts,) {
  const { database, } = opts;
  const fantasyService = new FantasyService(database,);

  return (
    new Elysia({ name: "nsfw-fantasies", },)
      .get(
        "/api/nsfw/fantasies/:actorId",
        async (ctx: any,) => {
          const auth = await requireActorAccess(database, ctx.params.actorId, ctx,);
          if (typeof auth !== "string") { return auth; }
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
        "/api/nsfw/fantasies",
        async (ctx: any,) => {
          try {
            const body = ctx.body as Record<string, unknown>;
            const auth = await requireActorAccess(database, (body.actorId as string) ?? "", ctx,);
            if (typeof auth !== "string") { return auth; }
            const fantasy = await fantasyService.createFantasy({
              database,
              actorId: body.actorId as string,
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
        "/api/nsfw/fantasies/discover",
        async (ctx: any,) => {
          try {
            const body = ctx.body as Record<string, unknown>;
            const auth = await requireActorAccess(database, (body.actorId as string) ?? "", ctx,);
            if (typeof auth !== "string") { return auth; }
            const result = await fantasyService.attemptDiscovery(
              body.actorId as string,
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
        "/api/nsfw/fantasies/:id/explore",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
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

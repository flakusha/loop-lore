import { Elysia, } from "elysia";
import { IntimacyService, } from "../../rpg/intimacy/service";
import { jsonError, jsonResponse, } from "../http-utils";
import { log, requireActorAccess, } from "./shared";
import type { HandlerOpts, } from "./types";

export function intimacyRoutes(opts: HandlerOpts, prefix = "/api") {
  const { database, } = opts;
  const intimacyService = new IntimacyService(database,);

  return (
    new Elysia({ name: "nsfw-intimacy", },)
      .get(
        prefix + "/nsfw/intimacy/:actorId/:targetId",
        async (ctx: any,) => {
          const auth = await requireActorAccess(database, ctx.params.actorId, ctx,);
          if (typeof auth !== "string") { return auth; }
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
        prefix + "/nsfw/intimacy/:actorId",
        async (ctx: any,) => {
          const auth = await requireActorAccess(database, ctx.params.actorId, ctx,);
          if (typeof auth !== "string") { return auth; }
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
        prefix + "/nsfw/intimacy/action",
        async (ctx: any,) => {
          try {
            const body = ctx.body as Record<string, unknown>;
            const auth = await requireActorAccess(database, (body.actorId as string) ?? "", ctx,);
            if (typeof auth !== "string") { return auth; }
            const result = await intimacyService.applyAction({
              database,
              actorId: body.actorId as string,
              targetActorId: body.targetActorId as string,
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

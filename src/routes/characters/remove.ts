import { Elysia, t, } from "elysia";
import {
  ActorIdParams,
  ErrorResponse,
} from "../../validation/schemas";
import { HttpStatus, jsonError, jsonNoContent, requireUserId, } from "../http-utils";
import type { HandlerOpts, } from "./types";

export function removeRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "characters-remove", },)
    .delete(
      prefix + "/actors/:actorId",
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const actor = await database
          .selectFrom("actors",)
          .selectAll()
          .where("id", "=", ctx.params.actorId,)
          .executeTakeFirst();
        if (!actor) {
          return jsonError({
            message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
            status: HttpStatus.NotFound,
          },);
        }

        if (actor.owner_id !== userId && ctx.userRole !== "admin") {
          return jsonError({ message: ctx.t?.("errors.forbidden",) ?? "Forbidden", status: HttpStatus.Forbidden, },);
        }

        await database.deleteFrom("actors",).where("id", "=", ctx.params.actorId,).execute();
        return jsonNoContent();
      },
      {
        params: ActorIdParams,
        response: {
          204: t.Void(),
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Delete actor",
          description: "Delete a character or actor. Owner or admin only.",
          tags: ["Characters",],
        },
      },
    );
}

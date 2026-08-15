import { Elysia, t, } from "elysia";
import {
  ActorIdParams,
  ErrorResponse,
} from "../../validation/schemas";
import { HttpStatus, jsonError, jsonResponse, } from "../http-utils";
import type { HandlerOpts, } from "./types";

export function readRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "characters-read", },)
    .get(
      `${prefix}/actors/:actorId`,
      async (ctx: any,) => {
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

        // Solo role is admin-equivalent for own actors (instance owner)
        const isAdminOrSolo = ctx.userRole === "admin" || ctx.userRole === "solo";
        if (!isAdminOrSolo && actor.visibility !== "public" && actor.user_id !== ctx.userId) {
          return jsonError({
            message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
            status: HttpStatus.NotFound,
          },);
        }
        return jsonResponse(actor,);
      },
      {
        params: ActorIdParams,
        response: {
          200: t.Any(),
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Get actor",
          description: "Get a character or actor by ID. Respects visibility rules.",
          tags: ["Characters",],
        },
      },
    );
}

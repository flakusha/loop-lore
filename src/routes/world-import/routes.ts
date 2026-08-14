import { Elysia, } from "elysia";
import { authenticate, } from "../../middleware/auth";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import type { WorldBundle, } from "../export-shared";
import { HttpStatus, jsonCreated, jsonError, } from "../http-utils";
import { importWorldBundle, } from "./bundle";
import { rowOf, } from "./rows";
import type { HandlerOpts, } from "./types";

export function worldImportRoutes({ database, config, }: HandlerOpts, prefix = "/api",): Elysia {
  return new Elysia({ name: "world-import", },).post(`${prefix}/import/world`, async (ctx: any,) => {
    const authResult = await authenticate({ request: ctx.request, database, authConfig: config.auth, },);
    if (authResult instanceof Response) { return authResult; }
    const userId = authResult.context.userId;
    if (!userId) {
      return jsonError({
        message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
        status: HttpStatus.Unauthorized,
      },);
    }

    let body: unknown;
    try {
      body = await ctx.request.json();
    } catch {
      return jsonError({ message: "Invalid JSON body", status: HttpStatus.BadRequest, },);
    }

    const bundle = rowOf(body,);
    if (!bundle || !rowOf(bundle.world,)) {
      return jsonError({
        message: "A valid world bundle with a `world` object is required",
        status: HttpStatus.BadRequest,
      },);
    }

    const { worldId, counts, } = await importWorldBundle(database, userId, body as WorldBundle,);
    return jsonCreated({ id: worldId, imported: counts, },);
  }, {
    response: {
      200: SuccessResponse,
      201: SuccessResponse,
      400: ErrorResponse,
      401: ErrorResponse,
    },
    detail: {
      summary: "Import a world bundle",
      description:
        "Create a new world plus its locations and story state from a single WorldBundle JSON (as produced by the story export).",
      tags: ["Import",],
    },
  },);
}

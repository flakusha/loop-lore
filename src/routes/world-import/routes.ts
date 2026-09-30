// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Type, } from "@sinclair/typebox";
import { Elysia, } from "elysia";
import { authenticate, } from "../../middleware/auth";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import type { WorldBundle, } from "../export-shared";
import { HttpStatus, jsonCreated, jsonError, } from "../http-utils";
import { importWorldBundle, } from "./bundle";
import { rowOf, } from "./rows";
import type { HandlerOpts, } from "./types";

/**
 * @param root0
 * @param root0.database
 * @param root0.config
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, {}, { derive: {}; resolve: {}; schema: {}; standaloneSchema: {}; response: {}; }, { ...; }>}
 */
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

    // Elysia parses the JSON body (the composed app forces a JSON parser
    // across the chain), so a manual `ctx.request.json()` here reads an
    // already-consumed stream and rejects every real import with a 400.
    const body: unknown = ctx.body;
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
    // Loose payload: a WorldBundle is a nested, versioned structure. Elysia
    // cannot statically infer through Type.Unknown, so the handler asserts the
    // shape at the boundary (rowOf checks below).
    body: Type.Unknown(),
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

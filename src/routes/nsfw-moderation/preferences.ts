// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW Moderation — user preferences routes.
 */
import { Elysia, } from "elysia";
import { NsfwModerationService, } from "../../nsfw/moderation-service";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonResponse, } from "../http-utils";
import {
  log,
  requireOwnOrAdmin,
  updatePrefsBody,
  userIdParam,
} from "./shared";
import type { HandlerOpts, } from "./types";

/**
 * @param opts
 * @param prefix
 */
export function preferencesRoutes(opts: HandlerOpts, prefix = "/api",) {
  const svc = new NsfwModerationService(opts.database,);

  return (
    new Elysia({ name: "nsfw-moderation-preferences", },)
      .get(`${prefix}/nsfw/moderation/preferences/:userId`, async (ctx: any,) => {
        const auth = requireOwnOrAdmin(ctx, ctx.params.userId,);
        if (typeof auth !== "string") { return auth; }
        try {
          const prefs = await svc.getPreferences(ctx.params.userId,);
          if (!prefs) { return jsonError("Preferences not found", 404,); }
          return jsonResponse({ ...SuccessResponse, data: prefs, },);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error,);
          log().error("Failed to get NSFW preferences", error instanceof Error ? error : undefined,);
          return jsonError(msg, 500,);
        }
      }, { params: userIdParam, response: { 200: SuccessResponse, 500: ErrorResponse, }, },)
      .put(`${prefix}/nsfw/moderation/preferences/:userId`, async (ctx: any,) => {
        const auth = requireOwnOrAdmin(ctx, ctx.params.userId,);
        if (typeof auth !== "string") { return auth; }
        try {
          const prefs = await svc.updatePreferences(ctx.params.userId, ctx.body,);
          return jsonResponse({ ...SuccessResponse, data: prefs, },);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error,);
          return jsonError(msg, 500,);
        }
      }, { params: userIdParam, body: updatePrefsBody, response: { 200: SuccessResponse, 500: ErrorResponse, }, },)
  );
}

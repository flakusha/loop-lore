// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW Moderation — content flag routes: report, queue, resolve.
 */
import { Elysia, t, } from "elysia";
import { NsfwModerationService, } from "../../nsfw/moderation-service";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonResponse, requireUserId, } from "../http-utils";
import { flagBody, flagQuery, requireAdmin, resolveFlagBody, } from "./shared";
import type { HandlerOpts, } from "./types";

export function flagsRoutes(opts: HandlerOpts, prefix = "/api",) {
  const svc = new NsfwModerationService(opts.database,);

  return (
    new Elysia({ name: "nsfw-moderation-flags", },)
      .post(`${prefix}/nsfw/moderation/flags`, async (ctx: any,) => {
        const auth = requireUserId(ctx,);
        if (typeof auth !== "string") { return auth; }
        try {
          const flag = await svc.flagContent(ctx.body,);
          return jsonResponse({ ...SuccessResponse, data: flag, },);
        } catch (error: unknown) {
          return jsonError(error instanceof Error ? error.message : String(error,), 400,);
        }
      }, { body: flagBody, response: { 200: SuccessResponse, 400: ErrorResponse, }, },)
      .get(`${prefix}/nsfw/moderation/flags`, async (ctx: any,) => {
        const auth = requireAdmin(ctx,);
        if (typeof auth !== "string") { return auth; }
        try {
          const status = (ctx.query.status as string) ?? "pending";
          const limit = Number(ctx.query.limit ?? 50,);
          const offset = Number(ctx.query.offset ?? 0,);
          const result = await svc.getFlagQueue({ status, limit, offset, },);
          return jsonResponse({ ...SuccessResponse, data: result, },);
        } catch (error: unknown) {
          return jsonError(error instanceof Error ? error.message : String(error,), 500,);
        }
      }, { query: flagQuery, response: { 200: SuccessResponse, 500: ErrorResponse, }, },)
      .put(`${prefix}/nsfw/moderation/flags/:id`, async (ctx: any,) => {
        const auth = requireAdmin(ctx,);
        if (typeof auth !== "string") { return auth; }
        try {
          const { resolvedBy, resolution, status, } = ctx.body;
          const flag = await svc.resolveFlag(ctx.params.id, resolvedBy, resolution, status,);
          return jsonResponse({ ...SuccessResponse, data: flag, },);
        } catch (error: unknown) {
          return jsonError(error instanceof Error ? error.message : String(error,), 400,);
        }
      }, {
        params: t.Object({ id: t.String(), },),
        body: resolveFlagBody,
        response: { 200: SuccessResponse, 400: ErrorResponse, },
      },)
  );
}

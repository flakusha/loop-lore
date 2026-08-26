// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW Moderation — audit log and GDPR export/delete routes.
 */
import { Elysia, } from "elysia";
import { NsfwModerationService, } from "../../nsfw/moderation-service";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonResponse, } from "../http-utils";
import { auditQuery, requireAdminUsers, requireModerationReview, userIdParam, } from "./shared";
import type { HandlerOpts, } from "./types";

export function auditRoutes(opts: HandlerOpts, prefix = "/api",) {
  const svc = new NsfwModerationService(opts.database,);

  return (
    new Elysia({ name: "nsfw-moderation-audit", },)
      .get(`${prefix}/nsfw/moderation/audit/:userId`, async (ctx: any,) => {
        const auth = requireModerationReview(ctx,);
        if (typeof auth !== "string") { return auth; }
        try {
          const limit = Number(ctx.query.limit ?? 100,);
          const offset = Number(ctx.query.offset ?? 0,);
          const actions = await svc.getAuditLog(ctx.params.userId, { limit, offset, },);
          return jsonResponse({ ...SuccessResponse, data: actions, },);
        } catch (error: unknown) {
          return jsonError(error instanceof Error ? error.message : String(error,), 500,);
        }
      }, { params: userIdParam, query: auditQuery, response: { 200: SuccessResponse, 500: ErrorResponse, }, },)
      .get(`${prefix}/nsfw/moderation/export/:userId`, async (ctx: any,) => {
        // PII surface: require the elevated `admin.users` capability.
        const auth = requireAdminUsers(ctx,);
        if (typeof auth !== "string") { return auth; }
        try {
          // Access-log row is written inside the service so every
          // caller path (route, scripts, jobs) emits it.
          const data = await svc.exportUserData(ctx.params.userId, auth,);
          return jsonResponse({ ...SuccessResponse, data, },);
        } catch (error: unknown) {
          return jsonError(error instanceof Error ? error.message : String(error,), 500,);
        }
      }, { params: userIdParam, response: { 200: SuccessResponse, 403: ErrorResponse, 500: ErrorResponse, }, },)
      .delete(`${prefix}/nsfw/moderation/export/:userId`, async (ctx: any,) => {
        const auth = requireAdminUsers(ctx,);
        if (typeof auth !== "string") { return auth; }
        try {
          await svc.deleteUserData(ctx.params.userId, auth,);
          return jsonResponse(SuccessResponse,);
        } catch (error: unknown) {
          return jsonError(error instanceof Error ? error.message : String(error,), 500,);
        }
      }, { params: userIdParam, response: { 200: SuccessResponse, 403: ErrorResponse, 500: ErrorResponse, }, },)
  );
}

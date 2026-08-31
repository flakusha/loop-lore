// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW Moderation — content flag routes: report, queue, resolve.
 *
 * Security posture:
 *   - `GET /flags` returns the redacted `FlagQueueView` projection: no
 *     `reporterId`, `description`, `chatId`, `worldId`, or `contentId`. The
 *     reporter is represented by `reporterHash` (HMAC-derived).
 *   - `limit` is server-side capped at 100 via `clampFlagLimit`.
 *   - `resolveFlag` returns `ResolvedFlagView` (no reporter PII, no content
 *     ids).
 *   - `description` is length-capped at creation by `checkDescriptionLength`.
 */
import { Elysia, t, } from "elysia";
import { clampFlagLimit, NsfwModerationService, toQueueView, toResolvedView, } from "../../nsfw/moderation-service";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonResponse, requireUserId, } from "../http-utils";
import { flagBody, flagQuery, requireModerationAction, requireModerationReview, resolveFlagBody, } from "./shared";
import type { HandlerOpts, } from "./types";

/**
 * @param opts
 * @param prefix
 */
export function flagsRoutes(opts: HandlerOpts, prefix = "/api",) {
  const svc = new NsfwModerationService(opts.database,);

  return (
    new Elysia({ name: "nsfw-moderation-flags", },)
      .post(`${prefix}/nsfw/moderation/flags`, async (ctx: any,) => {
        const reporterId = requireUserId(ctx,);
        if (typeof reporterId !== "string") { return reporterId; }
        try {
          const { contentType, contentId, chatId, worldId, flagReason, description, } = ctx.body;
          const flag = await svc.flagContent({
            reporterId,
            contentType,
            contentId,
            chatId,
            worldId,
            flagReason,
            description,
          },);
          // Return a redacted view (reporter hash, no chatId/worldId/contentId/description).
          const view = toQueueView(flag,);
          return jsonResponse({
            ...SuccessResponse,
            data: { id: view.id, status: view.status, reporterHash: view.reporterHash, },
          },);
        } catch (error: unknown) {
          return jsonError(error instanceof Error ? error.message : String(error,), 400,);
        }
      }, { body: flagBody, response: { 200: SuccessResponse, 400: ErrorResponse, }, },)
      .get(`${prefix}/nsfw/moderation/flags`, async (ctx: any,) => {
        const auth = requireModerationReview(ctx,);
        if (typeof auth !== "string") { return auth; }
        try {
          const status = (ctx.query.status as string) ?? "pending";
          const limit = clampFlagLimit(Number(ctx.query.limit ?? 50,),);
          const offset = Number(ctx.query.offset ?? 0,);
          const result = await svc.getFlagQueue({ status, limit, offset, },);
          // Strip reporter PII and contextual ids — only the redacted view is exposed.
          const flags = result.flags.map((f,) => toQueueView(f,));
          return jsonResponse({ ...SuccessResponse, data: { flags, total: result.total, }, },);
        } catch (error: unknown) {
          return jsonError(error instanceof Error ? error.message : String(error,), 500,);
        }
      }, { query: flagQuery, response: { 200: SuccessResponse, 500: ErrorResponse, }, },)
      .put(`${prefix}/nsfw/moderation/flags/:id`, async (ctx: any,) => {
        const adminId = requireModerationAction(ctx,);
        if (typeof adminId !== "string") { return adminId; }
        try {
          const { resolution, status, } = ctx.body;
          const flag = await svc.resolveFlag(ctx.params.id, adminId, resolution, status,);
          // Return a minimal ResolvedFlagView — no reporter PII, no content ids.
          const view = toResolvedView(flag,);
          return jsonResponse({ ...SuccessResponse, data: view, },);
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

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW Moderation — moderation-action appeal routes.
 *
 * Security posture:
 *   - POST   /api/nsfw/moderation/appeals        (self)         — submit
 *   - GET    /api/nsfw/moderation/appeals/me     (self)         — list own
 *   - GET    /api/nsfw/moderation/appeals/pending (admin)       — pending queue
 *   - PUT    /api/nsfw/moderation/appeals/:id/review (admin)    — approve/deny
 *   - POST   /api/nsfw/moderation/appeals/:id/execute (admin)   — execute reversal
 *
 * Auth: each handler pulls `ctx.userId` via the session-derived
 * guards in `./shared`. The reviewer (`reviewedBy`) and executor
 * (`executedBy`) are taken from the authenticated session, never the
 * request body. The reversal endpoint enforces `admin.users` and
 * refuses to run when `executedBy === approvedBy` (dual-admin
 * confirmation; see `BUG-nsfw-reviewappeal-auto-reverses-actions`).
 */
import { Elysia, t, } from "elysia";
import { NsfwModerationService, } from "../../nsfw/moderation-service";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonResponse, requireUserId, } from "../http-utils";
import { requireAdminUsers, requireModerationReview, } from "./shared";
import type { HandlerOpts, } from "./types";

/** Reject any extra fields on body schemas. */
const CLOSED = { additionalProperties: false, };
export const appealIdParam = t.Object({ id: t.String(), },);
export const submitAppealBody = t.Object({
  actionId: t.String(),
  reason: t.String({ minLength: 1, maxLength: 2000, },),
}, CLOSED,);
export const reviewAppealBody = t.Object({
  status: t.Union([t.Literal("approved",), t.Literal("denied",),],),
  reviewNote: t.String({ minLength: 1, maxLength: 2000, },),
}, CLOSED,);
export const executeReversalBody = t.Object({
  approvedBy: t.String(),
}, CLOSED,);

/**
 * @param opts
 * @param prefix
 */
export function appealsRoutes(opts: HandlerOpts, prefix = "/api",) {
  const svc = new NsfwModerationService(opts.database,);

  return (
    new Elysia({ name: "nsfw-moderation-appeals", },)
      // Submit — any authenticated user can submit an appeal for an
      // action that targeted them. The service does NOT verify the
      // caller owns `actionId`; we enforce that here.
      .post(`${prefix}/nsfw/moderation/appeals`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const { actionId, reason, } = ctx.body as { actionId: string; reason: string };
        try {
          // Caller MUST own the action they're appealing, OR be an admin.
          const isAdmin = ctx.userRole === "admin" || ctx.userRole === "solo" || ctx.userRole === "tester";
          if (!isAdmin) {
            const action = await opts.database
              .selectFrom("moderation_actions",)
              .select("target_user_id",)
              .where("id", "=", actionId,)
              .where("deleted_at", "is", null,)
              .executeTakeFirst();
            if (!action || action.target_user_id !== userId) {
              return jsonError("Cannot appeal an action that does not target the caller", 403,);
            }
          }
          const result = await svc.submitAppeal(userId, actionId, reason,);
          return jsonResponse({ ...SuccessResponse, data: result, },);
        } catch (error: unknown) {
          return jsonError(error instanceof Error ? error.message : String(error,), 400,);
        }
      }, {
        body: submitAppealBody,
        response: { 200: SuccessResponse, 400: ErrorResponse, 403: ErrorResponse, },
      },)
      // List own appeals — caller only.
      .get(`${prefix}/nsfw/moderation/appeals/me`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        try {
          const appeals = await svc.getUserAppeals(userId,);
          return jsonResponse({ ...SuccessResponse, data: appeals, },);
        } catch (error: unknown) {
          return jsonError(error instanceof Error ? error.message : String(error,), 500,);
        }
      }, { response: { 200: SuccessResponse, 500: ErrorResponse, }, },)
      // Pending queue — admin/moderator only.
      .get(`${prefix}/nsfw/moderation/appeals/pending`, async (ctx: any,) => {
        const auth = requireModerationReview(ctx,);
        if (typeof auth !== "string") { return auth; }
        try {
          const limit = Math.min(Math.max(Number(ctx.query.limit ?? 50,), 1,), 100,);
          const appeals = await svc.getPendingAppeals(limit,);
          return jsonResponse({ ...SuccessResponse, data: appeals, },);
        } catch (error: unknown) {
          return jsonError(error instanceof Error ? error.message : String(error,), 500,);
        }
      }, {
        query: t.Object({ limit: t.Optional(t.String(),), },),
        response: { 200: SuccessResponse, 500: ErrorResponse, },
      },)
      // Review (approve/deny) — admin/moderator only. Caller is the reviewer.
      .put(`${prefix}/nsfw/moderation/appeals/:id/review`, async (ctx: any,) => {
        const auth = requireModerationReview(ctx,);
        if (typeof auth !== "string") { return auth; }
        try {
          const { status, reviewNote, } = ctx.body as { status: "approved" | "denied"; reviewNote: string };
          await svc.reviewAppeal(ctx.params.id, auth, status, reviewNote,);
          return jsonResponse(SuccessResponse,);
        } catch (error: unknown) {
          return jsonError(error instanceof Error ? error.message : String(error,), 400,);
        }
      }, {
        params: appealIdParam,
        body: reviewAppealBody,
        response: { 200: SuccessResponse, 400: ErrorResponse, },
      },)
      // Execute reversal — `admin.users` capability AND `executedBy !== approvedBy`.
      .post(`${prefix}/nsfw/moderation/appeals/:id/execute`, async (ctx: any,) => {
        const auth = requireAdminUsers(ctx,);
        if (typeof auth !== "string") { return auth; }
        try {
          const { approvedBy, } = ctx.body as { approvedBy: string };
          await svc.executeReversal(ctx.params.id, auth, approvedBy,);
          return jsonResponse(SuccessResponse,);
        } catch (error: unknown) {
          return jsonError(error instanceof Error ? error.message : String(error,), 400,);
        }
      }, {
        params: appealIdParam,
        body: executeReversalBody,
        response: { 200: SuccessResponse, 400: ErrorResponse, 403: ErrorResponse, },
      },)
  );
}

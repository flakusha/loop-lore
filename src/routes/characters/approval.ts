// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character Approval Routes
 *
 * API endpoints for character review workflow:
 * submit-for-review, approve, reject, and pending-reviews list.
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import { approve, getPendingReviews, reject, submitForReview, } from "../../characters/service/approval";
import type { DB, } from "../../db";
import { can, } from "../../users/permissions";
import { Id, } from "../../validation/schemas";
import { HttpStatus, jsonError, jsonResponse, requireUserId, } from "../http-utils";

/** Approve/reject body: optional decision reason (matches the service's `reason?: string`). */
const ReviewDecisionBody = t.Object({ reason: t.Optional(t.String(),), },);

interface HandlerOpts {
  database: Kysely<DB>;
}

/**
 * @param {HandlerOpts} opts
 * @param {string} prefix
 * @returns {Elysia}
 */
export function approvalRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "characters-approval", },)
    .post(
      `${prefix}/characters/:id/submit-for-review`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const actorId = ctx.params.id as string;
        const result = await submitForReview({ database, actorId, userId, },);

        if (!result.ok) {
          return jsonError({ message: result.error, status: HttpStatus.BadRequest, },);
        }

        return jsonResponse({ id: actorId, review_state: "pending_review", },);
      },
      {
        params: t.Object({ id: Id, },),
        detail: { summary: "Submit character for review", tags: ["Characters", "Approval",], },
      },
    )
    .post(
      `${prefix}/characters/:id/approve`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const userRole = ctx.userRole as string | null;
        if (!can(userRole, "admin.character",)) {
          return jsonError({ message: "Forbidden", status: HttpStatus.Forbidden, },);
        }

        const actorId = ctx.params.id as string;
        const body = ctx.body as { reason?: string };
        const result = await approve({ database, actorId, adminId: userId, reason: body?.reason, },);

        if (!result.ok) {
          return jsonError({ message: result.error, status: HttpStatus.BadRequest, },);
        }

        return jsonResponse({ id: actorId, review_state: "approved", },);
      },
      {
        params: t.Object({ id: Id, },),
        body: ReviewDecisionBody,
        detail: { summary: "Approve character", tags: ["Characters", "Approval",], },
      },
    )
    .post(
      `${prefix}/characters/:id/reject`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const userRole = ctx.userRole as string | null;
        if (!can(userRole, "admin.character",)) {
          return jsonError({ message: "Forbidden", status: HttpStatus.Forbidden, },);
        }

        const actorId = ctx.params.id as string;
        const body = ctx.body as { reason?: string };
        const result = await reject({ database, actorId, adminId: userId, reason: body?.reason, },);

        if (!result.ok) {
          return jsonError({ message: result.error, status: HttpStatus.BadRequest, },);
        }

        return jsonResponse({ id: actorId, review_state: "rejected", },);
      },
      {
        params: t.Object({ id: Id, },),
        body: ReviewDecisionBody,
        detail: { summary: "Reject character", tags: ["Characters", "Approval",], },
      },
    )
    .get(
      `${prefix}/characters/pending-reviews`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const userRole = ctx.userRole as string | null;
        if (!can(userRole, "admin.character",)) {
          return jsonError({ message: "Forbidden", status: HttpStatus.Forbidden, },);
        }

        const result = await getPendingReviews({ database, },);

        if (!result.ok) {
          return jsonError({ message: result.error, status: HttpStatus.InternalServerError, },);
        }

        return jsonResponse({ data: result.value, total: result.value.length, },);
      },
      {
        detail: { summary: "List pending character reviews", tags: ["Characters", "Approval",], },
      },
    );
}

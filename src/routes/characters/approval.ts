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

interface HandlerOpts {
  database: Kysely<DB>;
}

/** A decision service call: both `approve` and `reject` take the
 * same arguments and return the same Result shape.
 */
type ReviewDecisionFn = (opts: {
  database: Kysely<DB>;
  actorId: string;
  adminId: string;
  reason?: string;
},) => Promise<{ ok: true; value: void } | { ok: false; error: string }>;

/**
 * The `admin.character` gate the admin routes on this surface share:
 * authenticated caller, then the permission check. Returns the caller's id
 * so a handler does not have to re-extract it.
 * @param ctx the Elysia request context
 * @returns the caller id, or the refusal response to return as-is
 */
function requireCharacterReviewer(ctx: any,): string | Response {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }
  const userRole = ctx.userRole as string | null;
  if (!can(userRole, "admin.character",)) {
    return jsonError({ message: "Forbidden", status: HttpStatus.Forbidden, },);
  }

  return userId;
}

/**
 * Shared approve/reject handler: admin gate, then the decision service, then
 * the resulting review state. The two routes differ only in the service call
 * and the state they echo back.
 * @param ctx the Elysia request context
 * @param database the request's Kysely handle
 * @param decide the decision service to call
 * @param reviewState the state to echo on success
 */
async function reviewDecision(
  ctx: any,
  database: Kysely<DB>,
  decide: ReviewDecisionFn,
  reviewState: string,
) {
  const userId = requireCharacterReviewer(ctx,);
  if (userId instanceof Response) { return userId; }

  const actorId = ctx.params.id as string;
  const body = ctx.body as { reason?: string };
  const result = await decide({ database, actorId, adminId: userId, reason: body?.reason, },);

  if (!result.ok) {
    return jsonError({ message: result.error, status: HttpStatus.BadRequest, },);
  }

  return jsonResponse({ id: actorId, review_state: reviewState, },);
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
        return await reviewDecision(ctx, database, approve, "approved",);
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
        return await reviewDecision(ctx, database, reject, "rejected",);
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
        const reviewer = requireCharacterReviewer(ctx,);
        if (reviewer instanceof Response) { return reviewer; }

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

/** Approve/reject body: optional decision reason (matches the service's `reason?: string`). */
const ReviewDecisionBody = t.Object({ reason: t.Optional(t.String(),), },);

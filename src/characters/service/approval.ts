// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character approval workflow service.
 *
 * Manages the review lifecycle: draft → pending_review → approved/rejected.
 * All functions return a Result type for explicit error handling.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { ReviewState, } from "../spec/enums";

export type Result<T,> = { ok: true; value: T } | { ok: false; error: string };

export interface PendingReview {
  id: string;
  display_name: string;
  owner_id: string | null;
  review_state: string;
  created_at: string;
}

export interface GetPendingReviewsOpts {
  limit?: number;
  offset?: number;
}

/**
 * Submit a character for review. Only the owner can submit.
 * @param {object} opts
 * @param {Kysely<DB>} opts.database
 * @param {string} opts.actorId
 * @param {string} opts.userId
 * @returns {Promise<Result<void>>}
 */
export async function submitForReview(opts: {
  database: Kysely<DB>;
  actorId: string;
  userId: string;
},): Promise<Result<void>> {
  const { database, actorId, userId, } = opts;

  const actor = await database
    .selectFrom("actors",)
    .select(["id", "owner_id", "review_state",],)
    .where("id", "=", actorId,)
    .executeTakeFirst();

  if (!actor) { return { ok: false, error: "Character not found", }; }
  if (actor.owner_id !== userId) { return { ok: false, error: "Only the owner can submit for review", }; }
  if (actor.review_state !== ReviewState.Draft && actor.review_state !== ReviewState.Rejected) {
    return { ok: false, error: `Cannot submit from state: ${actor.review_state}`, };
  }

  await database
    .updateTable("actors",)
    .set({ review_state: ReviewState.PendingReview, },)
    .where("id", "=", actorId,)
    .execute();

  return { ok: true, value: undefined, };
}

/**
 * Approve a character. Admin only.
 * @param {object} opts
 * @param {Kysely<DB>} opts.database
 * @param {string} opts.actorId
 * @param {string} opts.adminId
 * @param {string} [opts.reason]
 * @returns {Promise<Result<void>>}
 */
export async function approve(opts: {
  database: Kysely<DB>;
  actorId: string;
  adminId: string;
  reason?: string;
},): Promise<Result<void>> {
  const { database, actorId, } = opts;

  const actor = await database
    .selectFrom("actors",)
    .select(["id", "review_state",],)
    .where("id", "=", actorId,)
    .executeTakeFirst();

  if (!actor) { return { ok: false, error: "Character not found", }; }
  if (actor.review_state !== ReviewState.PendingReview) {
    return { ok: false, error: `Cannot approve from state: ${actor.review_state}`, };
  }

  await database
    .updateTable("actors",)
    .set({ review_state: ReviewState.Approved, },)
    .where("id", "=", actorId,)
    .execute();

  return { ok: true, value: undefined, };
}

/**
 * Reject a character. Admin only.
 * @param {object} opts
 * @param {Kysely<DB>} opts.database
 * @param {string} opts.actorId
 * @param {string} opts.adminId
 * @param {string} [opts.reason]
 * @returns {Promise<Result<void>>}
 */
export async function reject(opts: {
  database: Kysely<DB>;
  actorId: string;
  adminId: string;
  reason?: string;
},): Promise<Result<void>> {
  const { database, actorId, } = opts;

  const actor = await database
    .selectFrom("actors",)
    .select(["id", "review_state",],)
    .where("id", "=", actorId,)
    .executeTakeFirst();

  if (!actor) { return { ok: false, error: "Character not found", }; }
  if (actor.review_state !== ReviewState.PendingReview) {
    return { ok: false, error: `Cannot reject from state: ${actor.review_state}`, };
  }

  await database
    .updateTable("actors",)
    .set({ review_state: ReviewState.Rejected, },)
    .where("id", "=", actorId,)
    .execute();

  return { ok: true, value: undefined, };
}

/**
 * List characters pending review. Admin only.
 * @param {object} opts
 * @param {Kysely<DB>} opts.database
 * @param {GetPendingReviewsOpts} [opts.opts]
 * @returns {Promise<Result<PendingReview[]>>}
 */
export async function getPendingReviews(opts: {
  database: Kysely<DB>;
  opts?: GetPendingReviewsOpts;
},): Promise<Result<PendingReview[]>> {
  const { database, opts: queryOpts, } = opts;
  const limit = queryOpts?.limit ?? 50;
  const offset = queryOpts?.offset ?? 0;

  const reviews = await database
    .selectFrom("actors",)
    .select(["id", "display_name", "owner_id", "review_state", "created_at",],)
    .where("review_state", "=", ReviewState.PendingReview,)
    .orderBy("created_at", "asc",)
    .limit(limit,)
    .offset(offset,)
    .execute();

  return { ok: true, value: reviews, };
}

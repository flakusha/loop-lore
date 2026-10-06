// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character approval workflow service.
 *
 * Manages the review lifecycle: draft → pending_review → approved/rejected.
 * All functions return a Result type for explicit error handling.
 */
import type { Kysely, } from "kysely";
import { ActorType, } from "../../db/enums";
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

/** Columns every review transition reads before it decides. */
const REVIEW_COLUMNS = ["id", "actor_type", "review_state",] as const;

/**
 * Load a reviewable actor and apply the two checks every review transition
 * shares. `submitForReview` additionally reads `owner_id`, which it passes
 * in as `withOwner`; the extra column is then re-used for the ownership
 * check instead of loading the actor a second time.
 * @param database the scheduler's database handle
 * @param actorId actor whose review state is being read
 * @param withOwner also select `owner_id` (submitForReview needs it)
 * @returns the actor row, or the refusal to return as-is
 */
async function loadReviewable(
  database: Kysely<DB>,
  actorId: string,
  withOwner: boolean,
): Promise<
  | { loaded: true; actor: { id: string; actor_type: string; review_state: string; owner_id?: string | null } }
  | { loaded: false; refusal: Result<void> }
> {
  const actor = await database
    .selectFrom("actors",)
    .select(withOwner ? [...REVIEW_COLUMNS, "owner_id",] : [...REVIEW_COLUMNS,],)
    .where("id", "=", actorId,)
    .executeTakeFirst();

  if (!actor) {
    return { loaded: false, refusal: { ok: false, error: "Character not found", }, };
  }

  if (actor.actor_type !== ActorType.Character) {
    return { loaded: false, refusal: { ok: false, error: "Only characters are subject to review", }, };
  }

  return {
    loaded: true,
    actor: actor as { id: string; actor_type: string; review_state: string; owner_id?: string | null },
  };
}

/** Write one actor's `review_state`. Every transition in this module ends
 * with exactly this write; only the target state differs.
 * @param database the scheduler's database handle
 * @param actorId actor to transition
 * @param to the state to move the actor into
 * @returns {Promise<Result<void>>} always ok — a missing row is a no-op here
 */
async function setReviewState(
  database: Kysely<DB>,
  actorId: string,
  to: string,
): Promise<Result<void>> {
  await database
    .updateTable("actors",)
    .set({ review_state: to, },)
    .where("id", "=", actorId,)
    .execute();

  return { ok: true, value: undefined, };
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

  const found = await loadReviewable(database, actorId, true,);
  if (!found.loaded) { return found.refusal; }
  const actor = found.actor;

  if (actor.owner_id !== userId) { return { ok: false, error: "Only the owner can submit for review", }; }
  // New characters default to `pending_review` (migration 042), so an
  // already-queued character is a successful no-op rather than an error.
  if (actor.review_state === ReviewState.PendingReview) { return { ok: true, value: undefined, }; }
  if (actor.review_state !== ReviewState.Draft && actor.review_state !== ReviewState.Rejected) {
    return { ok: false, error: `Cannot submit from state: ${actor.review_state}`, };
  }

  return await setReviewState(database, actorId, ReviewState.PendingReview,);
}

/**
 * Shared body of {@link approve} / {@link reject}: both are the same
 * guarded `pending_review → <decision>` transition, differing only in the
 * target state and the verb used in the refusal message.
 * @param {object} opts
 * @param {Kysely<DB>} opts.database
 * @param {string} opts.actorId
 * @param {string} opts.to decision state to apply
 * @param {string} opts.verb verb used in the state-refusal message
 * @returns {Promise<Result<void>>}
 */
async function decide(opts: {
  database: Kysely<DB>;
  actorId: string;
  to: string;
  verb: string;
},): Promise<Result<void>> {
  const { database, actorId, to, verb, } = opts;

  const found = await loadReviewable(database, actorId, false,);
  if (!found.loaded) { return found.refusal; }
  const actor = found.actor;

  if (actor.review_state !== ReviewState.PendingReview) {
    return { ok: false, error: `Cannot ${verb} from state: ${actor.review_state}`, };
  }

  await database
    .updateTable("actors",)
    .set({ review_state: to, },)
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
  return await decide({
    database: opts.database,
    actorId: opts.actorId,
    to: ReviewState.Approved,
    verb: "approve",
  },);
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
  return await decide({
    database: opts.database,
    actorId: opts.actorId,
    to: ReviewState.Rejected,
    verb: "reject",
  },);
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
    // The queue is the *character* approval queue: exclude user/narrator/
    // system actors, which share the actors table but are never reviewed.
    .where("actor_type", "=", ActorType.Character,)
    .orderBy("created_at", "asc",)
    .limit(limit,)
    .offset(offset,)
    .execute();

  return { ok: true, value: reviews, };
}

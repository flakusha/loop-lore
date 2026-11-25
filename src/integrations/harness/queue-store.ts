// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * queue-store.ts — DB persistence for the harness turn queue
 * (TASK-harness-multi-agent-turn-queue).
 *
 * Row operations over `harness_queue_turns` (migration 100) and nothing
 * else — no scheduling logic; the pump lives in `queue.ts`. The queue's
 * crash safety is "the row IS the state", so the store only moves rows
 * between states and never interprets them.
 *
 * Concurrency: claim and boot recovery are safe across processes sharing one
 * database. The claim is one conditional UPDATE ... RETURNING whose subquery
 * checks the profile's in-flight state in the DB, so a losing UPDATE returns
 * no row and the caller never executes a turn it did not win. Recovery only
 * fails rows owned by the booting instance (rows claimed before migration
 * 105 have no owner and are left alone).
 */
import { type Generated, type Kysely, sql, } from "kysely";
import { HarnessQueueErrorCode, HarnessQueueTurnStatus, } from "../../db/enums";
import { type DB, type HarnessQueueTurns, } from "../../db/schema";

/**
 * The row as the service reads it: the Kysely `Generated<>` wrappers (a
 * column with a DB default) are stripped — the queue never INSERTs a read
 * row, it only observes one, so the wrapper adds nothing but noise.
 */
export type QueuedTurnRow = {
  [K in keyof HarnessQueueTurns]: HarnessQueueTurns[K] extends Generated<infer T> ? T : HarnessQueueTurns[K];
};

/** An enqueue-time insert: everything the queue needs to run a turn later. */
export interface InsertQueuedTurn {
  /** The turn row id (minted by the service). */
  id: string;
  /** The batch the turn belongs to. */
  batchId: string;
  /** The admin-configured profile the turn dispatches to. */
  profile: string;
  /** The prompt the harness works on. */
  prompt: string;
  /** The chat the turn's rows land in. */
  chatId: string;
  /** The actor the turn's rows are attributed to. */
  actorId: string;
  /** The enqueueing principal, re-presented to the gate at dispatch time. */
  requestedBy: string;
  /** The enqueueing principal's site role; null when unauthenticated. */
  requestedRole: string | null;
  /** Optional correlation id, passed through to the dispatch. */
  turnKey?: string;
  /** Enqueue timestamp (ISO, ms) — the pump's FIFO order within a status. */
  createdAt: string;
}

/** Insert a batch's rows, all `queued`. */
export async function insertQueuedTurns(
  database: Kysely<DB>,
  turns: InsertQueuedTurn[],
): Promise<void> {
  await database
    .insertInto("harness_queue_turns",)
    .values(turns.map((turn,) => ({
      id: turn.id,
      batch_id: turn.batchId,
      profile: turn.profile,
      prompt: turn.prompt,
      status: HarnessQueueTurnStatus.Queued,
      chat_id: turn.chatId,
      actor_id: turn.actorId,
      requested_by: turn.requestedBy,
      requested_role: turn.requestedRole,
      turn_key: turn.turnKey ?? null,
      created_at: turn.createdAt,
    })),)
    .execute();
}

/**
 * Claim the oldest queued turn whose profile has nothing in flight. The DB
 * check and the claim are one statement: SQLite serializes writes across
 * connections, so two instances cannot claim the same row or drive one
 * profile concurrently even though neither sees the other's memory.
 */
export interface ClaimNextQueuedTurnOptions {
  /** Claim timestamp (ISO) written to `started_at`. */
  now: string;
  /** Resolved instance slug written to `owner_slug` at claim time. */
  instanceSlug: string;
}

/**
 * Claim the next claimable turn, tagging it with this instance.
 * @param database - the queue's database
 * @param options - claim timestamp and claiming instance's slug
 * @returns the claimed row (running, attempts bumped), or null when the DB
 * found nothing claimable (queue drained, profile busy, or a rival won).
 */
export async function claimNextQueuedTurn(
  database: Kysely<DB>,
  options: ClaimNextQueuedTurnOptions,
): Promise<QueuedTurnRow | null> {
  const claimed = await database
    .updateTable("harness_queue_turns",)
    .set({
      status: HarnessQueueTurnStatus.Running,
      owner_slug: options.instanceSlug,
      started_at: options.now,
      attempts: sql`attempts + 1`,
    },)
    .where("status", "=", HarnessQueueTurnStatus.Queued,)
    .where("id", "=", (eb,) =>
      eb.selectFrom("harness_queue_turns as candidate",)
        .select("candidate.id",)
        .where("candidate.status", "=", HarnessQueueTurnStatus.Queued,)
        .where((eb,) =>
          eb.not(eb.exists(
            eb.selectFrom("harness_queue_turns as active",)
              .select("active.id",)
              .whereRef("active.profile", "=", "candidate.profile",)
              .where("active.status", "=", HarnessQueueTurnStatus.Running,),
          ),)
        )
        .orderBy("candidate.created_at", "asc",)
        .orderBy("candidate.id", "asc",)
        .limit(1,),)
    .returningAll()
    .execute();

  return claimed[0] ?? null;
}

/** Mark a finished turn `completed` with the assistant row it produced. */
export async function completeQueuedTurn(
  database: Kysely<DB>,
  id: string,
  patch: { resultMessageId: string; finishedAt: string },
): Promise<void> {
  await database
    .updateTable("harness_queue_turns",)
    .set({
      status: HarnessQueueTurnStatus.Completed,
      result_message_id: patch.resultMessageId,
      finished_at: patch.finishedAt,
    },)
    .where("id", "=", id,)
    .execute();
}

/** Mark a turn `failed` with the closed refusal vocabulary. */
export async function failQueuedTurn(
  database: Kysely<DB>,
  id: string,
  patch: { errorCode: HarnessQueueErrorCode; errorMessage: string; finishedAt: string },
): Promise<void> {
  await database
    .updateTable("harness_queue_turns",)
    .set({
      status: HarnessQueueTurnStatus.Failed,
      error_code: patch.errorCode,
      error_message: patch.errorMessage,
      finished_at: patch.finishedAt,
    },)
    .where("id", "=", id,)
    .execute();
}

/**
 * Cancel a turn — only while it is still `queued`: a running turn has a
 * live harness process behind it and no interrupt seam.
 * @returns 1 when the row moved queued → cancelled, else 0.
 */
export async function cancelQueuedTurn(
  database: Kysely<DB>,
  id: string,
  now: string,
): Promise<number> {
  const result = await database
    .updateTable("harness_queue_turns",)
    .set({ status: HarnessQueueTurnStatus.Cancelled, finished_at: now, },)
    .where("id", "=", id,)
    .where("status", "=", HarnessQueueTurnStatus.Queued,)
    .execute();

  return Number(result[0]?.numUpdatedRows ?? 0,);
}

/** Options for cancelling a running turn this instance can still signal. */
export interface CancelRunningTurnOptions {
  /** The running turn's id. */
  id: string;
  /** ISO timestamp written to `finished_at`. */
  now: string;
  /** Human-readable reason kept in `error_message`; no new error code. */
  reason: string;
}

/**
 * Interrupt a running turn. Status-only: the closed `error_code` vocabulary
 * has no cancelled value, so the reason rides in `error_message`.
 * @returns 1 when the row moved running → cancelled, else 0.
 */
export async function cancelRunningTurn(
  database: Kysely<DB>,
  options: CancelRunningTurnOptions,
): Promise<number> {
  const result = await database
    .updateTable("harness_queue_turns",)
    .set({
      status: HarnessQueueTurnStatus.Cancelled,
      error_message: options.reason,
      finished_at: options.now,
    },)
    .where("id", "=", options.id,)
    .where("status", "=", HarnessQueueTurnStatus.Running,)
    .execute();

  return Number(result[0]?.numUpdatedRows ?? 0,);
}

/**
 * Boot recovery options: the booting instance's identity decides which rows
 * are its own crashed work.
 */
export interface RecoverInterruptedTurnsOptions {
  /** Recovery timestamp (ISO) written to `finished_at`. */
  now: string;
  /** Instance whose orphaned running rows may be failed. */
  instanceSlug: string;
}

/**
 * Boot recovery: fail this instance's `running` rows `interrupted`. A turn
 * owned by another instance is still live there; a pre-105 row has no owner
 * and cannot be attributed, so neither is touched.
 * @param database - the queue's database
 * @param options - recovery timestamp and booting instance's slug
 * @returns how many rows were failed.
 */
export async function recoverInterruptedTurns(
  database: Kysely<DB>,
  options: RecoverInterruptedTurnsOptions,
): Promise<number> {
  const result = await database
    .updateTable("harness_queue_turns",)
    .set({
      status: HarnessQueueTurnStatus.Failed,
      error_code: HarnessQueueErrorCode.Interrupted,
      error_message: "the process died while the turn was running — no harness session survives a restart",
      finished_at: options.now,
    },)
    .where("status", "=", HarnessQueueTurnStatus.Running,)
    .where("owner_slug", "=", options.instanceSlug,)
    .execute();

  return Number(result[0]?.numUpdatedRows ?? 0,);
}

/** One turn row by id, or null. */
export async function getQueuedTurn(
  database: Kysely<DB>,
  id: string,
): Promise<QueuedTurnRow | null> {
  const rows = await database
    .selectFrom("harness_queue_turns",)
    .selectAll()
    .where("id", "=", id,)
    .limit(1,)
    .execute();

  return rows[0] ?? null;
}

/** Hard ceiling on a caller-supplied queue page size. */
export const MAX_QUEUE_LIMIT = 500;

/** Listing options: newest first, optional batch filter, bounded page. */
export interface ListQueuedTurnsOptions {
  /** Restrict to one batch's turns. */
  batchId?: string;
  /** Page size; default 100, hard-capped at {@link MAX_QUEUE_LIMIT}. */
  limit?: number;
}

/** List turns, newest first. */
export async function listQueuedTurns(
  database: Kysely<DB>,
  options: ListQueuedTurnsOptions = {},
): Promise<QueuedTurnRow[]> {
  const requested = options.limit ?? 100;
  const limit = Number.isFinite(requested,) && requested > 0
    ? Math.min(Math.trunc(requested,), MAX_QUEUE_LIMIT,)
    : 100;

  return await database
    .selectFrom("harness_queue_turns",)
    .selectAll()
    .$if(options.batchId !== undefined, (qb,) => qb.where("batch_id", "=", options.batchId!,),)
    .orderBy("created_at", "desc",)
    .orderBy("id", "desc",)
    .limit(limit,)
    .execute();
}

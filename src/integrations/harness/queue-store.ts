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
 * Concurrency: enqueue/observe may race freely; CLAIM is single-writer by
 * construction (the pump runs in one server process) and the claim UPDATE
 * re-checks `status = 'queued'`, so a row can only move queued → running
 * once even if that invariant ever changes.
 */
import { type Generated, type Kysely, } from "kysely";
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
 * Claim the next queued turn whose profile has nothing in flight. Scans in
 * enqueue order (created_at, then id) and claims the first row whose profile
 * is not running — the per-profile serialization primitive.
 * @param database - the queue's database
 * @param runningProfiles - profiles with a turn in flight right now
 * @param now - claim timestamp (ISO)
 * @returns the claimed row (running, attempts bumped), or null when nothing
 * is claimable (queue drained or every queued profile is busy).
 */
export async function claimNextQueuedTurn(
  database: Kysely<DB>,
  runningProfiles: readonly string[],
  now: string,
): Promise<QueuedTurnRow | null> {
  const candidates = await database
    .selectFrom("harness_queue_turns",)
    .selectAll()
    .where("status", "=", HarnessQueueTurnStatus.Queued,)
    .orderBy("created_at", "asc",)
    .orderBy("id", "asc",)
    .limit(100,)
    .execute();

  const next = candidates.find((row,) => !runningProfiles.includes(row.profile,));
  if (!next) { return null; }

  // The re-check makes the claim idempotent: a row can only leave `queued`
  // once, whoever gets there first.
  await database
    .updateTable("harness_queue_turns",)
    .set({
      status: HarnessQueueTurnStatus.Running,
      started_at: now,
      attempts: next.attempts + 1,
    },)
    .where("id", "=", next.id,)
    .where("status", "=", HarnessQueueTurnStatus.Queued,)
    .execute();

  return { ...next, status: HarnessQueueTurnStatus.Running, started_at: now, attempts: next.attempts + 1, };
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

/**
 * Boot recovery: fail every `running` row `interrupted`. Called before the
 * first pump — a turn observed running at boot was mid-flight in a process
 * that no longer exists.
 * @returns how many rows were failed.
 */
export async function recoverInterruptedTurns(
  database: Kysely<DB>,
  now: string,
): Promise<number> {
  const result = await database
    .updateTable("harness_queue_turns",)
    .set({
      status: HarnessQueueTurnStatus.Failed,
      error_code: HarnessQueueErrorCode.Interrupted,
      error_message: "the process died while the turn was running — no harness session survives a restart",
      finished_at: now,
    },)
    .where("status", "=", HarnessQueueTurnStatus.Running,)
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

/** Listing options: newest first, optional batch filter, bounded page. */
export interface ListQueuedTurnsOptions {
  /** Restrict to one batch's turns. */
  batchId?: string;
  /** Page size; default 100. */
  limit?: number;
}

/** List turns, newest first. */
export async function listQueuedTurns(
  database: Kysely<DB>,
  options: ListQueuedTurnsOptions = {},
): Promise<QueuedTurnRow[]> {
  return await database
    .selectFrom("harness_queue_turns",)
    .selectAll()
    .$if(options.batchId !== undefined, (qb,) => qb.where("batch_id", "=", options.batchId!,),)
    .orderBy("created_at", "desc",)
    .orderBy("id", "desc",)
    .limit(options.limit ?? 100,)
    .execute();
}

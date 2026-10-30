// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Job-status journal writer (TASK-harness-inflight-job-handles).
 *
 * Appends first-class `job_status` chat messages that surface harness/async
 * job state (pending → in_progress → complete/failed) in the chat timeline,
 * keyed by the async request id from `x-request-id`.
 *
 * APPEND-ONLY by design: every state transition is a NEW message row, never
 * an update-in-place. Message rows carry `record_hash` and the journal treats
 * them as immutable events (same philosophy as the swipe-sibling write path),
 * so a consumer can replay the timeline and read the exact state sequence.
 *
 * Exactly-once within a process: a per-process memo keyed by
 * `(jobId, state, step)` collapses duplicate events — a double progress
 * callback for the same step appends one row, not two. Terminal states clear
 * the job's memo entries; the memo is capped so jobs that never terminate
 * cannot grow it unbounded. Like turn-skip dedup, this is in-process only.
 */
import type { Kysely, } from "kysely";
import type { AsyncStore, } from "../../async/store";
import {
  ContentEncoding,
  MessageContentFormat,
  MessageContentType,
  MessageRole,
  MessageStatus,
  MessageVisibility,
} from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { safeJsonStringify, } from "../../utils";

/** Job lifecycle states surfaced on `job_status` rows (mirrors RequestStatus). */
export type JobState = "pending" | "in_progress" | "complete" | "failed";

/** Terminal states — writing one clears the job's dedupe memo entries. */
const TERMINAL_STATES: Partial<Record<JobState, true>> = { complete: true, failed: true, };

/** Cap on memo entries so never-terminating jobs cannot grow it unbounded. */
const MEMO_CAP = 1024;

/** Per-process memo of already-written events, keyed `${jobId}\u0000${state}\u0000${step ?? ""}`. */
const writtenEvents = new Map<string, true>();

/**
 * Clear the dedupe memo. Test-only seam: suites exercising
 * {@link appendJobStatus} call this in `afterEach` so the process-global
 * memo never carries entries between tests (parallel-safe contract —
 * shared module state must be per-test, not accumulated).
 */
export function resetJobStatusMemoForTests(): void {
  writtenEvents.clear();
}

/** Input for {@link appendJobStatus}. */
export interface JobStatusInput {
  database: Kysely<DB>;
  /** Chat the journal rows belong to. */
  chatId: string;
  /** Async job id — the `x-request-id` the async store row is tracked under. */
  jobId: string;
  /** Operation label, e.g. `auto-gen` (aligns with the harness task type). */
  op: string;
  /** Lifecycle state this row records. */
  state: JobState;
  /** Actor id for the `messages.actor_id` FK — the triggering user's actor. */
  actorId: string;
  /** Optional progress step name for `in_progress` rows (preparing/generating/storing). */
  step?: string;
  /** Optional harness turn id (generation attempt id) — stamped when known so `.harness/executions.jsonl` lines join to the row via metadata. */
  turnId?: string;
}

/**
 * Compact one-line summary for a job-status event. Shared by the DB writer
 * (row content) and the SSE bridge (live event payload) so both surfaces show
 * the same text.
 * @param op
 * @param state
 * @param step
 * @returns {string}
 */
export function jobStatusLine(op: string, state: JobState, step?: string,): string {
  return step === undefined ? `${op} ${state}` : `${op} ${state} — ${step}`;
}

/**
 * Post the initial `pending` journal row for a freshly tracked job. No-op
 * unless the caller wired both an async store and a request id — the same
 * condition under which the job was tracked at all. Best-effort, like every
 * write here: never throws into the request path.
 * @param args
 * @returns {Promise<void>}
 */
export async function postInitialJobStatus(args: {
  database: Kysely<DB>;
  chatId: string;
  actorId: string;
  requestId: string | undefined;
  asyncStore: AsyncStore | undefined;
  op: string;
},): Promise<void> {
  const { requestId, asyncStore, } = args;
  if (requestId === undefined || asyncStore === undefined) { return; }

  await appendJobStatus({
    database: args.database,
    chatId: args.chatId,
    jobId: requestId,
    op: args.op,
    state: "pending",
    actorId: args.actorId,
  },);
}

/**
 * Append a `job_status` message row for one job-state event, best-effort.
 *
 * Never throws into the caller (mirrors `injectPartyNarration`): any failure
 * is logged via the structured logger and swallowed — the job itself has
 * already been tracked in the async store, and a missing journal row is
 * cosmetic. Duplicate events (same job, state, and step) are no-ops.
 * @param input
 * @returns {Promise<void>}
 */
export async function appendJobStatus(input: JobStatusInput,): Promise<void> {
  const { database, chatId, jobId, op, state, actorId, step, turnId, } = input;
  const memoKey = `${jobId}\u0000${state}\u0000${step ?? ""}`;
  if (writtenEvents.has(memoKey,)) { return; }

  try {
    const metadata = safeJsonStringify({
      jobId,
      requestId: jobId,
      op,
      state,
      ...(step !== undefined && { step, }),
      ...(turnId !== undefined && { turnId, }),
    },);

    const line = jobStatusLine(op, state, step,);
    await database
      .insertInto("messages",)
      .values({
        id: crypto.randomUUID(),
        chat_id: chatId,
        actor_id: actorId,
        role: MessageRole.System,
        content: line,
        content_plaintext: line,
        content_type: MessageContentType.JobStatus,
        content_format: MessageContentFormat.Markdown,
        content_encoding: ContentEncoding.Identity,
        status: MessageStatus.Confirmed,
        visibility: MessageVisibility.Visible,
        metadata: metadata.ok ? metadata.value : null,
      },)
      .execute();

    if (writtenEvents.size >= MEMO_CAP) {
      const oldest = writtenEvents.keys().next().value;
      if (oldest !== undefined) { writtenEvents.delete(oldest,); }
    }

    writtenEvents.set(memoKey, true,);
    if (TERMINAL_STATES[state]) {
      for (const key of [...writtenEvents.keys(),]) {
        if (key.startsWith(`${jobId}\u0000`,)) { writtenEvents.delete(key,); }
      }
    }
  } catch (error) {
    // Non-fatal — the job is already tracked in the async store; the journal
    // row is a timeline nicety and must never fail the generation pipeline.
    getLogger().child({ module: "job-status", },).error(
      "job_status append failed",
      error instanceof Error ? error : undefined,
      { chatId, jobId, state, },
    );
  }
}

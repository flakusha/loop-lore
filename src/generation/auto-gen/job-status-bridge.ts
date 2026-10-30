// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Auto-gen → job_status bridge (TASK-harness-inflight-job-handles).
 *
 * The seam where requestId, chatId, and the harness turnId (attempt id) are
 * all in scope. Each call appends one `job_status` journal row via the
 * best-effort writer and, when the chat has a live SSE stream buffer,
 * pushes the same one-liner as a `job-status` event so connected clients
 * see the job state without polling. The buffer is never created here —
 * a chat with no active stream simply reads the persisted rows on its next
 * message fetch.
 *
 * Display-only by design: appending rows never schedules generation, so the
 * pause/cascade gates in the reply route stay authoritative (no
 * notification-loop class — see Claude Code #11716).
 */
import type { Kysely, } from "kysely";
import { appendJobStatus, type JobState, jobStatusLine, } from "../../chat/service/job-status";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { getBuffer, } from "../stream-buffer";

/** Input for {@link postJobStatus}. */
export interface JobStatusBridgeInput {
  database: Kysely<DB>;
  chatId: string;
  /** Triggering user (also the journal row's actor id). */
  userId: string;
  /** Async request id — absent means no job to annotate (no-op). */
  requestId: string | undefined;
  /** Lifecycle state to record. */
  state: JobState;
  /** Progress step name for `in_progress` rows. */
  step?: string;
  /** Harness turn id (generation attempt id) — stamped when known. */
  turnId?: string;
}

/** Fixed operation label; aligns with the harness `auto-gen` task type. */
const JOB_OP = "auto-gen";

/**
 * Record one auto-gen job-state event: journal row + best-effort live SSE
 * push. Never throws — the generation pipeline must not fail because status
 * surfacing did.
 * @param input
 * @returns {Promise<void>}
 */
export async function postJobStatus(input: JobStatusBridgeInput,): Promise<void> {
  const { database, chatId, userId, requestId, state, step, turnId, } = input;
  if (requestId === undefined) { return; }

  await appendJobStatus({
    database,
    chatId,
    jobId: requestId,
    op: JOB_OP,
    state,
    actorId: userId,
    step,
    turnId,
  },);

  try {
    getBuffer(chatId,)?.append("job-status", jobStatusLine(JOB_OP, state, step,),);
  } catch (error) {
    // Live push is best-effort only; the row is already persisted.
    getLogger().child({ module: "job-status-bridge", },).error(
      "job_status SSE push failed",
      error instanceof Error ? error : undefined,
      { chatId, requestId, state, },
    );
  }
}

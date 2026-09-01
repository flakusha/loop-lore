// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { CancelReason, CancelSource, GenerationStatus, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { activeGenerations, chatToAttempt, safeTransition, updateAttemptStatus, } from "../cancellation-tracker";
import { storePartialContent, } from "../continuation";
import { GenerationCancelledError, } from "./error";

// ── Cancellation by attempt / chat ────────────────────────

/**
 * Cancel an active generation by attempt ID.
 * Returns true if cancellation was actually performed.
 */

/** */
export interface CancelGenerationOpts {
  attemptId: string;
  reason: CancelReason;
  source: CancelSource;
  detail: string;
}

/**
 * @param root0
 * @param root0.attemptId
 * @param root0.reason
 * @param root0.source
 * @param root0.detail
 */
export function cancelGeneration({ attemptId, reason, source, detail, }: CancelGenerationOpts,): boolean {
  const active = activeGenerations.get(attemptId,);
  if (!active) { return false; }

  if (active.abortController.signal.aborted) { return false; }

  // Capture partial content from repetition detector buffer before cleanup
  const partialContent = active.repetitionDetector.getBufferText();
  if (partialContent) {
    storePartialContent(attemptId, partialContent,);
  }

  safeTransition({
    active,
    to: GenerationStatus.Cancelled,
    log: getLogger().child({ module: "generation", },),
  },);
  active.abortController.abort(new GenerationCancelledError(reason, source, detail,),);

  // Fan-out: cancel any registered side-effect jobs (TTS / image-queue).
  // Each cancel handler is invoked synchronously; an isolated throw from
  // a single job is caught and logged so one misbehaving job cannot
  // prevent the rest from being torn down (the user's Stop click must
  // always take effect end-to-end).
  if (active.sideEffectJobs?.size ?? 0 > 0) {
    for (const [jobId, job,] of active.sideEffectJobs ?? new Map()) {
      try {
        const result = job.cancel();
        if (result instanceof Promise) {
          // Fire-and-forget: the abort signal above is the synchronous
          // synchronisation point that unblocks the provider; we still
          // surface the promise to logs so a hung job is visible.
          void result.catch((error: unknown,) => {
            getLogger()
              .child({ module: "generation", },)
              .warn("Side-effect job cancel rejected", {
                attemptId,
                jobId,
                kind: job.kind,
                error: error instanceof Error ? error.message : String(error,),
              },);
          },);
        }
      } catch (error: unknown) {
        getLogger()
          .child({ module: "generation", },)
          .warn("Side-effect job cancel threw synchronously", {
            attemptId,
            jobId,
            kind: job.kind,
            error: error instanceof Error ? error.message : String(error,),
          },);
      }
    }
  }

  // Fire callback
  active.events?.onCancel?.(attemptId, reason, detail,);

  // Stop-and-respond: leave deliveryConfirmed=false on the active record so
  // any in-flight billing view excludes the partial output. The persisted
  // status update is the caller's responsibility (cancelGenerationByChat
  // owns the canonical DB write so we never race two writes for the same
  // attempt row).

  // Clean tracking
  activeGenerations.delete(attemptId,);
  chatToAttempt.delete(active.chatId,);

  return true;
}

/**
 * Cancel generation by chat ID.
 */
export interface CancelGenerationByChatOpts {
  db: Kysely<DB>;
  chatId: string;
  reason?: CancelReason;
  source?: CancelSource;
  detail?: string;
}

/**
 * @param root0
 * @param root0.db
 * @param root0.chatId
 * @param root0.reason
 * @param root0.source
 * @param root0.detail
 */
export function cancelGenerationByChat({
  db,
  chatId,
  reason = CancelReason.UserCancel,
  source = CancelSource.User,
  detail = "",
}: CancelGenerationByChatOpts,): boolean {
  const attemptId = chatToAttempt.get(chatId,);
  if (!attemptId) { return false; }

  // Snapshot the in-memory flags BEFORE cancelGeneration clears the entry,
  // so the persistence write below carries the truncation point the user
  // actually saw and the side-effect fan-out flag.
  const active = activeGenerations.get(attemptId,);
  const lastRendered = active?.lastRenderedChunkIndex ?? -1;
  const hadSideEffects = (active?.sideEffectJobs?.size ?? 0) > 0;

  const wasCancelled = cancelGeneration({ attemptId, reason, source, detail, },);

  if (wasCancelled) {
    void updateAttemptStatus({
      db,
      attemptId,
      status: GenerationStatus.Cancelled,
      extra: {
        cancel_reason: reason,
        cancel_reason_detail: detail,
        cancel_source: source,
        // Stop-and-respond: persist the truncation point + side-effect flag.
        // delivery_confirmed_at is left NULL because the response was not
        // delivered in full — billing queries must skip this attempt.
        last_rendered_chunk_index: lastRendered,
        delivery_confirmed_at: null,
        side_effect_jobs_cancelled: hadSideEffects ? 1 : 0,
        completed_at: new Date().toISOString(),
      },
    },).catch((error: unknown,) => {
      getLogger()
        .child({ module: "generation", },)
        .error("Failed to update attempt status", error instanceof Error ? error : undefined,);
    },);
  }

  return wasCancelled;
}

/**
 * Get the abort signal for a given attempt. Returns null if the
 * attempt is not active or has already been cancelled.
 * @param attemptId
 */
export function getAbortSignal(attemptId: string,): AbortSignal | null {
  const active = activeGenerations.get(attemptId,);
  return active?.abortController.signal ?? null;
}

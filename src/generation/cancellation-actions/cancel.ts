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

export interface CancelGenerationOpts {
  attemptId: string;
  reason: CancelReason;
  source: CancelSource;
  detail: string;
}

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

  // Fire callback
  active.events?.onCancel?.(attemptId, reason, detail,);

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

export function cancelGenerationByChat({
  db,
  chatId,
  reason = CancelReason.UserCancel,
  source = CancelSource.User,
  detail = "",
}: CancelGenerationByChatOpts,): boolean {
  const attemptId = chatToAttempt.get(chatId,);
  if (!attemptId) { return false; }

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
 */
export function getAbortSignal(attemptId: string,): AbortSignal | null {
  const active = activeGenerations.get(attemptId,);
  return active?.abortController.signal ?? null;
}

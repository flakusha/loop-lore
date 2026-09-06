// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { CancelReason, CancelSource, GenerationStatus, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { GenerationCancelledError, } from "../cancellation-actions/error";
import { activeGenerations, chatToAttempt, updateAttemptStatus, } from "../cancellation-tracker";
import { scheduleBufferCleanup, StreamBuffer, } from "../stream-buffer";
import { sseData, } from "./sse-utils";

/**
 * BUG-stream-cancel-leaves-attempt-stuck-processing-forever-no-cle:
 *
 * Post-cancel cleanup for the SSE stream path. When a provider call throws
 * because the stream was cancelled (GenerationCancelledError or AbortError),
 * the attempt must be:
 *
 * 1. Persisted as GenerationStatus.Cancelled (not Failed) with the cancel
 *    metadata captured — the status/resume endpoints then report Cancelled
 *    instead of a false error.
 * 2. Released from in-memory tracking (activeGenerations + chatToAttempt)
 *    so the attempt doesn't stay "Processing" forever.
 * 3. Buffered as done (not errored) and closed, so reconnect consumers
 *    resolve with a cancelled `done` frame instead of hanging on an open
 *    buffer or receiving an error frame.
 *
 * @param deps - DB, attempt identity, the stream error, accumulated SSE
 *   content, the stream buffer, and the readable-stream controller.
 */
export async function streamCancelCleanup(deps: {
  db: Kysely<DB>;
  attemptId: string;
  chatId: string;
  error: unknown;
  streamError: string;
  accumulatedContent: string;
  buffer: StreamBuffer;
  controller: ReadableStreamDefaultController;
},): Promise<void> {
  const log = getLogger().child({ module: "generate-route", },);
  const { db, attemptId, chatId, error, streamError, accumulatedContent, buffer, controller, } = deps;

  // Cancel metadata from the thrown error when available; fall back to a
  // generic user cancel for bare AbortError (client disconnect / external
  // abort carries no reason).
  const err = error as Error;
  const isCancelledError = err instanceof GenerationCancelledError;
  const cancelReason = isCancelledError ? err.reason : CancelReason.UserCancel;
  const cancelSource = isCancelledError ? err.source : CancelSource.User;

  try {
    const active = activeGenerations.get(attemptId,);
    await updateAttemptStatus({
      db,
      attemptId,
      status: GenerationStatus.Cancelled,
      extra: {
        cancel_reason: cancelReason,
        cancel_reason_detail: streamError,
        cancel_source: cancelSource,
        completed_at: new Date().toISOString(),
        last_rendered_chunk_index: active?.lastRenderedChunkIndex ?? -1,
        delivery_confirmed_at: null,
      },
    },);
  } catch (dbError: unknown) {
    log.error("Failed to persist cancel status", dbError instanceof Error ? dbError : undefined,);
  } finally {
    const active = activeGenerations.get(attemptId,);
    if (active) {
      active.deliveryConfirmed = false;
      activeGenerations.delete(attemptId,);
      chatToAttempt.delete(active.chatId,);
    }
  }

  buffer.signalDone();
  scheduleBufferCleanup(chatId,);

  controller.enqueue(
    new TextEncoder().encode(
      sseData({ type: "done", attemptId, cancelled: true, finishReason: "cancelled", content: accumulatedContent, },),
    ),
  );
  controller.close();
}

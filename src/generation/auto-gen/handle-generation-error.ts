// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Generation pipeline error handling: telemetry, buffer signalling, logging.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { isTelemetryEnabled, record, } from "../../telemetry/service";
import type { GenDeps, } from "./deps";

/** Handle generation pipeline errors (telemetry + buffer + logging). */
export async function handleGenerationError(
  error: unknown,
  database: Kysely<DB>,
  d: GenDeps,
  chatId: string,
  userId: string,
  attemptId?: string,
) {
  if (attemptId) {
    try {
      await d.failGeneration({ attemptId, error: error as Error, db: database, },);
    } catch { /* best-effort */ }
  }
  if (isTelemetryEnabled()) {
    void record(database, {
      eventType: "generation.failed",
      userId,
      chatId,
      data: { error: (error as Error).message, chatId, },
    },);
  }
  try {
    const buf = d.getOrCreateBuffer(chatId,);
    buf.signalError((error as Error).message,);
    d.scheduleBufferCleanup(chatId,);
  } catch { /* best-effort */ }

  const err = error instanceof Error ? error : new Error(String(error,),);
  const log = getLogger().child({ module: "auto-gen", },);
  if (err.name === "AbortError" || err.message === "Request cancelled" || err.message === "Request timed out") {
    log.warn("Auto-generation aborted", { reason: err.message, },);
  } else {
    log.error("Auto-generation failed", err,);
  }
}

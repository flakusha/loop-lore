// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW moderation event logging.
 *
 * Privacy posture (BUG-nsfw-gate-log-plaintext-pii):
 *   - `user_id` and `entity_id` are HMAC-hashed at write time so raw
 *     identifiers never land in `log_entries`. The hash is stable
 *     across rows (correlation) but unrecoverable without the secret.
 *   - Free-form `reason` strings are rejected; only the closed
 *     `NsfwGateReason` enum is accepted. Admins keep full detail in
 *     `moderation_actions.reason`; the audit row carries only a
 *     severity bucket.
 *   - `metadata` PII keys are stripped (prompt fragments, message
 *     bodies, etc.) and the payload is capped at 1 KiB.
 *   - The structured logger no longer echoes the full event object —
 *     it logs `decisionType`, `hash`, and `reason` (the enum) only.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db";
import { getLogger, } from "../../logger";
import {
  applyNsfwMetadataRedaction,
  hashId,
  isNsfwGateReason,
  type NsfwGateReason,
} from "../../nsfw/pii-redaction";
import { jsonStringifyOr, } from "../../utils";

/** Action types emitted to the gate audit log. */
export type NsfwGateAction = "blocked" | "allowed" | "warning";

export interface LogNsfwEventInput {
  userId: string | null;
  actorId?: string;
  chatId?: string;
  action: NsfwGateAction;
  /** Closed enum; free-form strings throw. */
  reason: NsfwGateReason;
  metadata?: Record<string, unknown>;
}

/**
 * Log an NSFW moderation event for audit.
 *
 * Throws if `reason` is not a known `NsfwGateReason` (no silent acceptance
 * of free-form text — see BUG-nsfw-gate-log-plaintext-pii).
 */
export async function logNsfwEvent(
  database: Kysely<DB>,
  event: LogNsfwEventInput,
): Promise<void> {
  if (!isNsfwGateReason(event.reason)) {
    throw new Error(
      `logNsfwEvent: reason must be a NsfwGateReason, got "${String(event.reason)}"`,
    );
  }

  // Hash identifiers before persisting; the raw values never touch the row.
  const userHash = event.userId ? await hashId(event.userId) : null;
  const actorHash = event.actorId ? await hashId(event.actorId) : null;
  const chatHash = event.chatId ? await hashId(event.chatId) : null;

  const entityType = actorHash ? "actor" : (chatHash ? "chat" : null);
  const entityId = actorHash || chatHash || null;

  const redactedMeta = applyNsfwMetadataRedaction(event.metadata,);
  const meta = jsonStringifyOr(redactedMeta,);
  try {
    const log = getLogger().child({ module: "nsfw-gate", },);
    // Non-PII summary: action bucket, hashed subject, severity bucket only.
    log.info("NSFW gate decision", {
      decisionType: event.action,
      hash: userHash,
      reason: event.reason,
    },);

    await database
      .insertInto("log_entries",)
      .values({
        id: crypto.randomUUID(),
        level: 6, // INFO
        timestamp: Date.now(),
        time: new Date().toISOString(),
        message: `NSFW gate: ${event.action} — ${event.reason}`,
        module: "nsfw-gate",
        user_id: userHash,
        entity_type: entityType,
        entity_id: entityId,
        action: event.action,
        meta,
        event_type: `nsfw.gate.${event.action}`,
      },)
      .execute();
  } catch (error: unknown) {
    try {
      const log = getLogger().child({ module: "nsfw-gate" });
      log.error(
        "Failed to log NSFW event",
        error instanceof Error ? error : new Error(String(error)),
        { decisionType: event.action, reason: event.reason },
      );
    } catch { /* logger not initialized */ }
  }
}

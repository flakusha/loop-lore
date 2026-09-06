// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Telemetry Service
 *
 * Opt-in anonymized event recording. No content — metadata only.
 *   generation.started/completed/failed
 *   tool.called/failed
 *   frontend.page_view/click/error
 *
 * Privacy posture (BUG-telemetry-errors-leaks-raw-event-data):
 *   - `record()` now takes pre-validated `EventParams` (typed payloads only).
 *     Free-form `Record<string, unknown>` is rejected at the route layer
 *     (see `validation/schemas/telemetry.ts`).
 *   - `event_data` is byte-capped at `TELEMETRY_EVENT_DATA_MAX_BYTES`; over-cap
 *     events are dropped (not silently truncated, which could mislead).
 *   - Server-side callers (`generation.failed`) redact `error.message` and
 *     carry only a `reason` + `code` bucket — raw provider strings never
 *     reach the audit log.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { safeJsonStringify, } from "../utils";
import { TELEMETRY_EVENT_DATA_MAX_BYTES, } from "../validation/schemas/telemetry";
import { loadTelemetryConfig, } from "./config";

const config = loadTelemetryConfig();

/**
 * PII-safe stable id: SHA-256, truncated to 12 hex chars — enough to
 * correlate per-entity event flows without storing raw user/chat/session ids
 * (BUG-telemetry-stores-raw-client-body-real-user-chat-session-ids).
 * @param id
 */
export function hashId(id?: string | null,): string | null {
  if (!id) { return null; }
  return new Bun.CryptoHasher("sha256",).update(id,).digest("hex",).slice(0, 12,);
}

interface EventParams {
  eventType: string;
  /** Server-derived from session context. */
  sessionId?: string | null;
  /** Server-derived from `ctx.userId`. */
  userId?: string | null;
  /** Server-derived from chat context (e.g. chat_id). */
  chatId?: string | null;
  /** Strict, typed payload (see `TelemetryEventBody` for the schema). */
  data: Record<string, unknown>;
  /** "server" for internal callers; "frontend" for client-originated. */
  source?: "server" | "frontend";
}

/**
 * @param db
 * @param root0
 * @param root0.eventType
 * @param root0.sessionId
 * @param root0.userId
 * @param root0.chatId
 * @param root0.data
 * @param root0.source
 */
export async function record(
  db: Kysely<DB>,
  { eventType, sessionId, userId, chatId, data, source, }: EventParams,
): Promise<void> {
  if (!config.eventsEnabled) { return; }

  const payload = (() => {
    const r = safeJsonStringify(data,);
    return r.ok ? r.value : "{}";
  })();

  if (payload.length > TELEMETRY_EVENT_DATA_MAX_BYTES) {
    getLogger()
      .child({ module: "telemetry", },)
      .warn("Dropping telemetry event: payload exceeds byte cap", {
        eventType,
        bytes: payload.length,
        cap: TELEMETRY_EVENT_DATA_MAX_BYTES,
      },);
    return;
  }

  try {
    await db
      .insertInto("telemetry_events",)
      .values({
        id: crypto.randomUUID(),
        event_type: eventType,
        source: source ?? "server",
        session_id: hashId(sessionId,),
        user_id: hashId(userId,),
        chat_id: hashId(chatId,),
        event_data: payload,
        created_at: new Date().toISOString(),
      },)
      .execute();
  } catch (error: unknown) {
    getLogger()
      .child({ module: "telemetry", },)
      .warn("Failed to record telemetry event", { error: String(error,), },);
  }
}

/** */
export function isTelemetryEnabled(): boolean {
  return config.eventsEnabled;
}

/** */
export function isFrontendTelemetryEnabled(): boolean {
  return config.frontendEnabled;
}

/** */
export function getRetentionDays(): number {
  return config.retentionDays;
}

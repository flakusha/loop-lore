// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Telemetry route validation schemas.
 *
 * Privacy posture (BUG-telemetry-errors-leaks-raw-event-data):
 *   - Ingest is restricted to a typed per-`type` discriminator. Free-form
 *     `data: Record<string, Any>` is gone — only known telemetry types with
 *     narrow payloads are accepted. Events that try to set `user_id`,
 *     `chat_id`, or `session_id` directly are rejected (those are
 *     server-derived from `ctx.userId` / `ctx.sessionId` / chat context).
 *   - `TelemetryAnalyticsErrorsRow` mirrors the server-side projection:
 *     id / event_type / created_at / occurrences only. `event_data`,
 *     `user_id`, `chat_id`, `session_id` are NOT in the response shape.
 */

import { t, } from "elysia";

/** Max size of a serialized event payload (8 KiB). */
export const TELEMETRY_EVENT_DATA_MAX_BYTES = 8 * 1024;

// ── Ingest: per-type discriminator ─────────────────────────

const frontendPageView = t.Object({
  type: t.Literal("frontend.page_view",),
  data: t.Object({
    path: t.String({ maxLength: 256, },),
    referrer: t.Optional(t.String({ maxLength: 256, },),),
  },),
},);

const frontendClick = t.Object({
  type: t.Literal("frontend.click",),
  data: t.Object({
    selector: t.String({ maxLength: 256, },),
  },),
},);

const frontendError = t.Object({
  type: t.Literal("frontend.error",),
  data: t.Object({
    message: t.String({ maxLength: 256, },),
    /** Stack-trace digest; raw stacks are never accepted. */
    stackDigest: t.String({ maxLength: 64, },),
  },),
},);

const generationStarted = t.Object({
  type: t.Literal("generation.started",),
  data: t.Object({
    provider: t.String({ maxLength: 64, },),
    model: t.String({ maxLength: 128, },),
  },),
},);

const generationCompleted = t.Object({
  type: t.Literal("generation.completed",),
  data: t.Object({
    provider: t.String({ maxLength: 64, },),
    model: t.String({ maxLength: 128, },),
    promptTokens: t.Integer(),
    completionTokens: t.Integer(),
    latencyMs: t.Integer(),
  },),
},);

/** `generation.failed` data is sanitised server-side: only `{reason, code}` are kept. */
const generationFailed = t.Object({
  type: t.Literal("generation.failed",),
  data: t.Object({
    provider: t.String({ maxLength: 64, },),
    model: t.String({ maxLength: 128, },),
    reason: t.String({ maxLength: 128, },),
    code: t.String({ maxLength: 64, },),
  },),
},);

/**
 * Ingest body: server injects sessionId / userId / chatId from the request
 * context. Callers MUST NOT set these directly; their presence in the body
 * is rejected (no silent strip) so client code can't drift into claiming
 * an actor identity.
 */
export const TelemetryEventBody = t.Union(
  [frontendPageView, frontendClick, frontendError, generationStarted, generationCompleted, generationFailed,],
  {
    additionalProperties: false,
    description:
      "Typed telemetry event. serverId/userId/chatId are derived from the request context; clients MUST NOT include them.",
  },
);

/** Narrow server-side projection of a failed telemetry event. */
export const TelemetryAnalyticsErrorsRow = t.Object({
  id: t.String(),
  event_type: t.String(),
  source: t.String(),
  created_at: t.String(),
  /** Number of times this exact event_type was observed in the time window. */
  occurrences: t.Integer(),
},);

// Re-export schema name so existing imports still resolve.
// (Kept as a type alias for callers that destructure by name.)
export type TelemetryEventBodyT = typeof TelemetryEventBody;
export type TelemetryAnalyticsErrorsRowT = typeof TelemetryAnalyticsErrorsRow;
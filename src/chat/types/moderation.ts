// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat moderation type surface.
 *
 * Two coexisting layers live here:
 *
 * 1. **Pure permission/state layer** (`ModerationAction`, etc.) — used by
 *    `src/chat/moderation.ts` for in-memory checks (`isBlocked`, `isBanned`,
 *    `getShadowState`, etc.). These do not touch the database and remain
 *    stable for unit tests that exercise policy without I/O.
 *
 * 2. **DB-backed audit ledger** (`ModerationActionKind`,
 *    `ModerationAuditEntry`, `ApplyOptions`) — used by `applyBan` /
 *    `applyKick` / `applyMute` / `applyFlag`. Each writes a
 *    `moderation_actions` row plus a `log_entries` audit row in a single
 *    transaction; the audit row is queryable via
 *    `src/middleware/nsfw-gate/logging.ts` for compliance review.
 */

// ─── Pure permission/state layer ───────────────────────────────────────

/** Type of moderation action (legacy in-memory representation). */
export type ModerationActionType = "block" | "ban" | "shadow" | "collapse" | "flag";

/** Scope of a moderation action. */
export type ModerationScope = "chat" | "blog" | "comment" | "global";

/** A moderation action applied to a user or message. */
export interface ModerationAction {
  type: ModerationActionType;
  /** Who is being moderated. */
  targetActorId: string;
  /** Scope of the moderation. */
  scope: ModerationScope;
  /** Who applied the moderation. */
  actorId: string;
  /** Reason for the moderation. */
  reason?: string;
  /** Whether this is internal (mod queue) or external (user report). */
  internal: boolean;
}

// ─── DB-backed action primitive layer ──────────────────────────────────

/**
 * Discriminated action kinds accepted by the `applyBan` / `applyKick` /
 * `applyMute` / `applyFlag` primitives.
 *
 * - `ban` — removes the target from the chat for the configured scope and
 *   writes a `moderation_actions` row plus a `log_entries` audit row. A
 *   `banned_until` timestamp is stamped on `chat_participants` (or
 *   deleted entirely for an indefinite scope-wide ban).
 * - `kick` — removes the target from the chat immediately; the row is
 *   deleted so the target can rejoin later. History is preserved.
 * - `mute` — sets `chat_participants.muted_until = now + duration` and
 *   writes the audit row. The `isMuted(participant, now)` predicate
 *   (see `src/chat/moderation.ts`) is the single source of truth for
 *   suppressing inbound/outbound traffic.
 * - `flag-nsfw` — escalation point for NSFW content (calls
 *   `src/generation/hooks/moderation-hook.ts` and writes the audit row).
 * - `flag-tox` — escalation point for toxicity / off-topic / etc.; same
 *   audit path as `flag-nsfw` but with a different `severity` tag.
 */
export type ModerationActionKind = "ban" | "kick" | "mute" | "flag-nsfw" | "flag-tox";

/** Severity tag attached to flag-style actions. */
export type ModerationSeverity = "info" | "warn" | "severe";

/** Event-type strings written into `log_entries.event_type`. */
export type ModerationEventType =
  | "moderation.chat.ban"
  | "moderation.chat.kick"
  | "moderation.chat.mute"
  | "moderation.chat.flag.nsfw"
  | "moderation.chat.flag.tox";

/**
 * Result returned by every `apply*` primitive.
 *
 * - `ok: true` + `auditEntryId` — action committed and audit row written.
 * - `ok: false` + `reason` — caller-side rejection (e.g. target equals
 *   caller); the transaction was never opened.
 */
export interface ApplyResult {
  ok: boolean;
  auditEntryId?: string;
  /** Moderation-action row id (only set when a `moderation_actions` row was inserted). */
  actionId?: string;
  reason?: string;
}

/** Options accepted by every `apply*` primitive. */
export interface ApplyOptions {
  /** Target chat id. */
  chatId: string;
  /** Target actor being moderated. */
  targetActorId: string;
  /** Actor applying the moderation (admin / chat owner / caller). */
  byActorId: string;
  /** Moderation scope (`chat` for chat-local, `global` for whole account). */
  scope: ModerationScope;
  /** Optional human-readable reason (stored verbatim on the audit row). */
  reason?: string;
  /** Mute/ban duration in ms. Optional — default = indefinite. */
  durationMs?: number;
  /**
   * Action discriminator. Required by `applyFlag` (selects
   * `flag-nsfw` vs `flag-tox` and whether the moderation hook fires).
   * Ignored by `applyBan` / `applyKick` / `applyMute`.
   */
  kind?: ModerationActionKind;
}

/**
 * A `log_entries` row written for compliance auditing. Mirrors the schema
 * in `src/db/schema-core.ts:LogEntries` but only the columns the
 * moderation primitives populate.
 */
export interface ModerationAuditEntry {
  id: string;
  /** Mirrors `log_entries.level` — INFO=6, WARN=4, ERROR=3. */
  level: number;
  timestamp: number;
  time: string;
  message: string;
  module: "chat-moderation";
  user_id: string | null;
  entity_type: "chat" | "actor";
  entity_id: string | null;
  action: ModerationActionKind;
  event_type: ModerationEventType;
  /** Free-form context — scope, reason, duration, caller. */
  meta: Record<string, unknown>;
}

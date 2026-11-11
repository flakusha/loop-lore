// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * DB Schema Enums — harness turn queue (TASK-harness-multi-agent-turn-queue).
 *
 * `HarnessQueueTurnStatus` is the row's lifecycle (`harness_queue_turns.status`,
 * migration 100): a turn is enqueued `queued`, claimed `running`, and ends
 * `completed`, `failed` or `cancelled`. There is no numeric state — the
 * string IS the state.
 *
 * `HarnessQueueErrorCode` is the closed vocabulary a FAILED turn records in
 * `error_code`. It mirrors `HarnessDispatchCode` (the dispatch refusal that
 * killed the turn) value-for-value and adds `interrupted` — a turn that was
 * mid-flight when the process died, failed by boot recovery because no ACP
 * session survives a restart.
 */

// ── Queue turn lifecycle ─────────────────────────────────
export const HarnessQueueTurnStatus = {
  Queued: "queued",
  Running: "running",
  Completed: "completed",
  Failed: "failed",
  Cancelled: "cancelled",
} as const;
/** */
export type HarnessQueueTurnStatus = (typeof HarnessQueueTurnStatus)[keyof typeof HarnessQueueTurnStatus];

// ── Why a turn failed ────────────────────────────────────
export const HarnessQueueErrorCode = {
  HarnessDisabled: "harness_disabled",
  RoleDenied: "role_denied",
  ProfileUnknown: "profile_unknown",
  TurnFailed: "turn_failed",
  Interrupted: "interrupted",
} as const;
/** */
export type HarnessQueueErrorCode = (typeof HarnessQueueErrorCode)[keyof typeof HarnessQueueErrorCode];

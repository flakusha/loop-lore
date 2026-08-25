// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Generation Cancellation Tracker
 *
 * In-memory tracking for active LLM generation attempts.
 * Owns the ActiveGeneration map, lifecycle (start/complete/fail),
 * DB persistence helpers, and status queries.
 *
 * Split into domain modules: state (maps + transitions + queries),
 * persistence (DB helpers), lifecycle (start/complete/fail), types.
 */

// ── In-memory state / queries ─────────────────────────────
export {
  activeGenerations,
  chatToAttempt,
  getActiveAttemptId,
  isChatGenerating,
  listActiveGenerations,
  safeTransition,
} from "./state";

// ── DB persistence ────────────────────────────────────────
export { updateAttemptStatus, } from "./persistence";

// ── Lifecycle ─────────────────────────────────────────────
export {
  completeGeneration,
  failGeneration,
  IdempotencyKeyConflictError,
  startGenerationTracking,
} from "./lifecycle";

// ── Public types ──────────────────────────────────────────
export type {
  ActiveGeneration,
  CompleteGenerationOpts,
  FailGenerationOpts,
  StartGenerationTrackingOpts,
  UpdateAttemptStatusOpts,
} from "./types";

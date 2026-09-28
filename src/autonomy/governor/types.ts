// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/autonomy/governor/types.ts — Autonomy rate governor shapes
//
// Pure shapes — no DB / logger / telemetry imports. The governor module
// owns the runtime; tests import from here to avoid pulling Kysely.

/** Which dimension the counter is scoped to. */
export type AutonomyScopeKind = "actor" | "user";

/** Built-in limit names. Callers pass the literal string; new limits
 *  require adding entries to the LIMIT_CATALOG in `./index.ts`.
 */
export type GovernorLimitName =
  | "per_tick_action"
  | "per_minute_generation"
  | "per_hour_beat_dispatch";

/** Caller-supplied identity for the consume target. */
export interface AutonomyScope {
  /** "actor" — per-actor cap, scope_id = actor_id. */
  kind: AutonomyScopeKind;
  /** The id of the actor (when kind="actor") or user (when kind="user"). */
  id: string;
}

/** Single resolved limit definition. The governor never owns it. */
export interface GovernorLimit {
  /** Window length in milliseconds (rolling). */
  windowMs: number;
  /** Maximum consumption within the window. null = unbounded (skip). */
  cap: number | null;
}

/** Catalog lookup: limit name → its base definition. Per-scope caps are
 *  layered on at runtime via `AutonomyConfig` (per-agent / per-user).
 */
export interface GovernorLimitCatalog {
  readonly per_tick_action: GovernorLimit;
  readonly per_minute_generation: GovernorLimit;
  readonly per_hour_beat_dispatch: GovernorLimit;
}

/** Options for a single `tryConsume` call. */
export interface TryConsumeOptions {
  /** Optional cap override (e.g. test fixtures). null = unbounded. */
  cap?: number | null;
  /** Override `now` for tests. Defaults to `Date.now()`. */
  nowMs?: number;
  /** Optional session ID for the telemetry event on trip. */
  sessionId?: string;
  /** Chat ID for telemetry scoping. */
  chatId?: string;

  /** World id for config resolution. Defaults to the chat's own world. */
  worldId?: string;
}

/** Result of a `tryConsume` call. */
export interface GovernorResult {
  /** True = consume succeeded; false = cap exceeded (caller MUST skip). */
  ok: boolean;
  /** Remaining capacity in the window AFTER this attempt (0 when ok=false). */
  remaining: number;
  /** When the current window resets (epoch ms). */
  resetAt: number;
  /** Cap that was applied. null when the limit is unbounded. */
  cap: number | null;
  /** Post-increment window_count (0 when ok=false, count did not advance). */
  count: number;
}

/** Result of a non-consuming `peek` — the window as it stands, with no
 *  decision and no mutation. `remaining` is null (not infinite) for an
 *  unbounded scope, so a UI can render "unlimited" rather than a
 *  misleadingly huge number.
 */
export interface GovernedWindow {
  /** Capacity left in the current window. null = unbounded. */
  remaining: number | null;
  /** When the current window resets (epoch ms). */
  resetAt: number;
  /** Cap in force. null = unbounded. */
  cap: number | null;
  /** Consumes already recorded in this window. */
  count: number;
}

/** A persisted budget row. The governor never auto-prunes. */
export interface BudgetRow {
  scope_kind: AutonomyScopeKind;
  scope_id: string;
  limit_name: GovernorLimitName;
  window_start_at: string;
  window_count: number;
  updated_at: string;
}

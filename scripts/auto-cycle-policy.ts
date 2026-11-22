// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Slice-1 auto-cycle policy — four pure decisions, no scheduler and no I/O.
 *
 * The caller owns every resource (lanes, worktrees, subagents, quota probes).
 * These functions only decide; they never claim, spawn, kill, write or sleep.
 * Slice 2 owns the driver that acts on the decisions.
 */

import {
  restartBackoffMs,
  SUPERVISION_MAX_RESTARTS,
} from "../src/services/server-external-manager/supervise";

/** Minimum briefing score before an agent may pick up a ticket. */
const MIN_BRIEFING_SCORE = 3;

/** The ticket fields the eligibility rule needs. */
export interface PolicyTicket {
  id: string;
  lane: string;
  acceptanceCriteria: readonly string[];
}

/** Why a ticket was rejected, for the driver to log in the lane file. */
export type EligibilityReason =
  | "missing-lane"
  | "claimed-lane"
  | "no-acceptance-criteria"
  | "low-score";

/** Discriminated verdict — the reason is never inferred from a falsy boolean. */
export type Eligibility =
  | { ok: true; id: string; lane: string }
  | { ok: false; id: string; reason: EligibilityReason };

/**
 * Gate one ticket against active lane claims and its briefing score.
 * @param ticket - ticket id, lane slug and acceptance-criteria lines
 * @param activeLanes - lane slots already claimed through `giwt intercom claim`
 * @param score - briefing linter score for this ticket
 * @returns an eligible lane or the first failed check
 */
export function eligibility(
  ticket: PolicyTicket,
  activeLanes: readonly string[],
  score: number,
): Eligibility {
  if (ticket.lane.trim() === "") { return { ok: false, id: ticket.id, reason: "missing-lane", }; }
  if (activeLanes.includes(ticket.lane,)) { return { ok: false, id: ticket.id, reason: "claimed-lane", }; }
  if (!ticket.acceptanceCriteria.some((line,) => line.trim() !== "")) {
    return { ok: false, id: ticket.id, reason: "no-acceptance-criteria", };
  }
  if (score < MIN_BRIEFING_SCORE) { return { ok: false, id: ticket.id, reason: "low-score", }; }
  return { ok: true, id: ticket.id, lane: ticket.lane, };
}

/** Loop-lore's two harness tiers — no provider adapters in this slice. */
export type ModelTier = "good" | "fast";

/** Inputs to the tier decision, already resolved by the caller. */
export interface ModelSelectionInput {
  /** Task modality from the routing vocabulary; unknown values fall through. */
  modality: string;
  /** Operator pin (`AUTO.json` / CLI flag) — wins outright. */
  userPin?: ModelTier;
  /** A profile's breaker is open; only consulted when modality has no opinion. */
  breakerTripped?: boolean;
  /** Cached verdict available; last tiebreaker before the safe default. */
  cacheHit?: boolean;
}

const GOOD_MODALITIES: ReadonlySet<string> = new Set(["planning", "design", "review",],);
const FAST_MODALITIES: ReadonlySet<string> = new Set([
  "implementation",
  "debugging",
  "testing",
  "finalization",
  "research",
],);

/**
 * Select a tier by override precedence: user pin > modality map > observed
 * breaker > cache hit > safe default. A tripped breaker is a hard skip of the
 * concrete profile at dispatch time; here it only downgrades an unconstrained
 * task to `fast`. Unknown modalities default to `good` unless a cache hit
 * makes the cheap tier sufficient.
 */
export function selectModel(input: ModelSelectionInput,): ModelTier {
  if (input.userPin !== undefined) { return input.userPin; }
  if (GOOD_MODALITIES.has(input.modality,)) { return "good"; }
  if (FAST_MODALITIES.has(input.modality,)) { return "fast"; }
  if (input.breakerTripped === true || input.cacheHit === true) { return "fast"; }
  return "good";
}

/** Retry decision; `exhausted` is a stop condition, not a zero-length sleep. */
export type BackoffDecision =
  | { kind: "retry"; attempt: number; waitMs: number }
  | { kind: "exhausted"; attempt: number };

/**
 * Jittered exponential backoff reused from the watchdog's supervision policy,
 * extended to at least the quota reset reported by `_omp/usage`.
 *
 * Attempts are 1-based. `SUPERVISION_MAX_RESTARTS` (5) is the cap: reaching it
 * stops the loop rather than sleeping forever. `retryAtMs` is an absolute
 * epoch-ms quota reset, or null when no quota report exists.
 */
export function backoffMs(
  attempt: number,
  retryAtMs: number | null,
  now: number,
): BackoffDecision {
  if (!Number.isInteger(attempt,) || attempt < 1 || attempt >= SUPERVISION_MAX_RESTARTS) {
    return { kind: "exhausted", attempt, };
  }
  const quotaWaitMs = retryAtMs === null ? 0 : retryAtMs - now;
  // Fixed jitter=1 keeps the policy deterministic; supervise.ts owns the cap.
  return {
    kind: "retry",
    attempt,
    waitMs: Math.max(0, restartBackoffMs(attempt, 1,), quotaWaitMs,),
  };
}

/** Partial child state collected before a kill; every field is optional. */
export interface ChildResult {
  lane?: string;
  taskId?: string;
  branch?: string;
  worktree?: string;
  status?: string;
  diffStat?: string;
  commits?: readonly string[];
  gates?: readonly string[];
  filesTouched?: readonly string[];
  residuals?: readonly string[];
  nextStep?: string;
  spendUsd?: number;
  elapsedMs?: number;
}

const NONE = "(none recorded)";

function field(label: string, value: string | undefined,): string {
  return `- **${label}:** ${value === undefined || value.trim() === "" ? NONE : value.trim()}`;
}

function listField(label: string, values: readonly string[] | undefined,): string {
  const body = values === undefined || values.length === 0
    ? `  - ${NONE}`
    : values.map((value,) => `  - ${value}`).join("\n",);
  return `- **${label}:**\n${body}`;
}

/**
 * Render the append-only `## INTERRUPTED` section written to FIXED-<lane>.md.
 * Pure and clock-free: the caller supplies the timestamp when it writes.
 */
export function summaryContract(result: ChildResult,): string {
  const status = result.diffStat === undefined
    ? result.status
    : `${result.status ?? ""}${result.status ? " — " : ""}${result.diffStat}`;
  const spend = result.spendUsd === undefined ? NONE : `$${result.spendUsd.toFixed(2,)}`;
  const time = result.elapsedMs === undefined ? NONE : `${result.elapsedMs} ms`;
  return [
    "## INTERRUPTED",
    "",
    field("Lane", result.lane,),
    field("Task", result.taskId,),
    field("Branch", result.branch,),
    field("Worktree", result.worktree,),
    field("Status", status,),
    listField("Commits", result.commits,),
    listField("Gates", result.gates,),
    listField("Files touched", result.filesTouched,),
    listField("Residuals", result.residuals,),
    field("Next step", result.nextStep,),
    field("Spend / time", `${spend} / ${time}`,),
    "",
  ].join("\n",);
}

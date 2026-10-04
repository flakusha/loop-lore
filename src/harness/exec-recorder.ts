// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Exec-log recorder: the writer's only real caller.
 *
 * Lives here rather than in `call-with-failover.ts` so the provider layer
 * never imports harness code, and so the cost math has exactly one home.
 */
import { appendExecLog, } from "./exec-log";
import { getGitContext, LOG_PID, newRunId, } from "./run-context";
import type { HarnessResult, HarnessRunRecord, HarnessTaskType, } from "./types";

/** Token usage reported by a provider response. */
export interface ExecUsage {
  promptTokens: number;
  completionTokens: number;
}

/** What the egress seam knows about one finished call. */
export interface ExecRunInput {
  taskType: HarnessTaskType;
  model: string;
  runMs: number;
  result: HarnessResult;
  usage?: ExecUsage;
  error?: string | null;
  /** Tools the call was offered. */
  tools?: string[];
  /** Pattern that produced the call; empty means "none". */
  pattern?: string;
  patternDetail?: string;
  /** What was being done, in human terms. */
  task?: string;
  /** Set when the failure is a missing capability, not a provider fault. */
  toolingGap?: string | null;
  /** USD per 1k tokens, when the provider declares it. */
  costPer1kTokens?: number;
  /** Free-form note about the outcome. */
  msg?: string | null;
  /**
   * Correlation id of the user turn this call belongs to. Every tool round of
   * one turn passes the same value. Omitted when the dispatch site has no turn
   * in scope; the record then carries null, never a fabricated id.
   */
  turnId?: string | null;
}

/**
 * Cost in USD, or null when the provider declares no price.
 *
 * No price table is invented: a provider that does not publish
 * `costPer1kTokens` yields null, which means "unknown" and is never treated as
 * "free".
 * @param input - the run, for its price and token counts
 * @returns USD rounded to 6dp, or null when unpriced or the token count is negative.
 */
export function computeCostUsd(input: ExecRunInput,): number | null {
  const rate = input.costPer1kTokens;
  if (rate === undefined || !Number.isFinite(rate,) || rate < 0) { return null; }
  if (input.usage === undefined) { return null; }
  // Providers report -1 for "usage unavailable" on a failed call — the exact
  // case this log exists to capture. A negative count is unknown, not a rebate.
  const tokens = input.usage.promptTokens + input.usage.completionTokens;
  if (!Number.isFinite(tokens,) || tokens < 0) { return null; }
  return Math.round(rate * (tokens / 1000) * 1_000_000,) / 1_000_000;
}

/**
 * A provider's token count, floored at 0 and coerced to 0 when unusable.
 *
 * `-1` is the common "usage unavailable" sentinel on a failed call, and
 * NaN/Infinity are the other way a bad adapter reports it. All three mean
 * "unknown", which the rollup can only carry as 0.
 * @param v - the raw count from the provider, or undefined when unreported
 * @returns a finite, non-negative count.
 */
function tokenCount(v: number | undefined,): number {
  return typeof v === "number" && Number.isFinite(v,) ? Math.max(0, v,) : 0;
}

/**
 * Build the run record for one finished egress call.
 * @param input - what the seam observed
 * @returns The record, ready for `appendExecLog`.
 */
export function buildRunRecord(input: ExecRunInput,): HarnessRunRecord {
  const { branch, gitSha, } = getGitContext();
  const tools = input.tools ?? [];
  return {
    runId: newRunId(),
    ts: new Date().toISOString(),
    runMs: input.runMs,
    task: input.task ?? input.taskType,
    taskType: input.taskType,
    model: input.model,
    tools,
    toolCount: tools.length,
    pattern: input.pattern ?? "none",
    patternDetail: input.patternDetail ?? "",
    result: input.result,
    error: input.error ?? null,
    toolingGap: input.toolingGap ?? null,
    costUsd: computeCostUsd(input,),
    // Clamped for the same reason the cost is nulled: a -1 sentinel must not
    // reach the rollup as a negative count. `Math.max(0, NaN)` is NaN, so the
    // finiteness check has to come first — otherwise a NaN usage number
    // serializes to `null` in the API and breaks the `Type.Number()` contract.
    tokensIn: tokenCount(input.usage?.promptTokens,),
    tokensOut: tokenCount(input.usage?.completionTokens,),
    branch,
    gitSha,
    pid: LOG_PID,
    msg: input.msg ?? null,
    turnId: input.turnId ?? null,
  };
}

/**
 * Record one finished call. Fire-and-forget: `appendExecLog` never throws and
 * this wrapper must not start one.
 * @param input - what the egress seam observed
 * @returns nothing
 */
export function recordExecRun(input: ExecRunInput,): void {
  appendExecLog(buildRunRecord(input,),);
}

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
}

/**
 * Cost in USD, or null when the provider declares no price.
 *
 * No price table is invented: a provider that does not publish
 * `costPer1kTokens` yields null, which means "unknown" and is never treated as
 * "free".
 * @param input - the run, for its price and token counts
 * @returns USD rounded to 6dp, or null when unpriced.
 */
export function computeCostUsd(input: ExecRunInput,): number | null {
  const rate = input.costPer1kTokens;
  if (rate === undefined || !Number.isFinite(rate,) || rate < 0) { return null; }
  if (input.usage === undefined) { return null; }
  const tokens = (input.usage.promptTokens + input.usage.completionTokens) / 1000;
  return Math.round(rate * tokens * 1_000_000,) / 1_000_000;
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
    tokensIn: input.usage?.promptTokens ?? 0,
    tokensOut: input.usage?.completionTokens ?? 0,
    branch,
    gitSha,
    pid: LOG_PID,
    msg: input.msg ?? null,
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

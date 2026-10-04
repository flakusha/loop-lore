// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Harness exec log record types.
 *
 * The TS interface is camelCase; the persisted JSONL uses snake_case wire names
 * so `.harness/executions.jsonl` greps the same as the agent ledger's
 * `.ledger.jsonl`. That wire half — `HarnessRunWire`, `serializeRun` and
 * `deserializeRun` — lives in ./types-wire, and is re-exported here so
 * existing `from "./types"` imports keep working.
 */
import type { HarnessRunDetail, HarnessRunSummary, } from "./read-models";
import type { HarnessTaskType, } from "./types-wire";

// Wire-side names re-exported from ./types-wire so existing
// `from "./types"` imports keep working.
export { deserializeRun, HARNESS_TASK_TYPES, serializeRun, } from "./types-wire";
export type { HarnessTaskType, } from "./types-wire";

/** How the run ended. `"error"` is the only failure value, so `jq` can count it. */
export type HarnessResult = "ok" | "error" | "timeout" | "cancelled";

/** Tools the run touched (tool names, not payloads). */
export type HarnessTool = string;

/** One line of `.harness/executions.jsonl` in camelCase. */
export interface HarnessRunRecord {
  runId: string;
  ts: string;
  runMs: number;
  task: string;
  taskType: HarnessTaskType;
  model: string;
  tools: HarnessTool[];
  toolCount: number;
  pattern: string;
  patternDetail: string;
  result: HarnessResult;
  error: string | null;
  toolingGap: string | null;
  /**
   * USD, or null when the provider declares no `costPer1kTokens`. Null is
   * distinct from 0: "unknown price" must never be summed as "free". The
   * summary row coalesces null to 0 for consumers that require a number.
   */
  costUsd: number | null;
  tokensIn: number;
  tokensOut: number;
  branch: string | null;
  pid: number | null;
  gitSha: string | null;
  msg: string | null;
  /**
   * Correlation id of the user turn this run belongs to. Every tool round of
   * one turn stamps the same value, so the several lines one turn wrote form
   * one node. Null on a line written before turns were correlated.
   */
  turnId: string | null;
}

// Read-model shapes (summaries, filters, stats rollups) live in ./read-models
// and are re-exported here so existing `from "./types"` imports keep working.
export type {
  HarnessByModel,
  HarnessByPattern,
  HarnessByTaskType,
  HarnessRunDetail,
  HarnessRunFilter,
  HarnessRunSummary,
  HarnessStats,
  HarnessToolingGap,
  HarnessTotals,
} from "./read-models";

/**
 * Record → the summary row the list endpoint returns.
 * @param record
 * @returns Summary view (drops `tools`, `pattern`, `patternDetail`, `toolingGap`, `msg`).
 */
export function toSummary(record: HarnessRunRecord,): HarnessRunSummary {
  return {
    runId: record.runId,
    ts: record.ts,
    durationMs: record.runMs,
    task: record.task,
    taskType: record.taskType,
    model: record.model,
    toolCount: record.toolCount,
    result: record.result,
    error: record.error,
    // Coalesce unknown cost to 0 here: the summary is the API contract and its
    // consumers (TypeBox `Type.Number()`, `toFixed`) require a real number.
    costUsd: record.costUsd ?? 0,
    tokensIn: record.tokensIn,
    tokensOut: record.tokensOut,
    branch: record.branch,
    gitSha: record.gitSha,
    pid: record.pid,
    turnId: record.turnId,
  };
}

/**
 * Record → the detail row the detail endpoint returns.
 *
 * Built ON TOP OF `toSummary`, not beside it: the list and detail endpoints
 * must not be able to disagree about a field name or a nullability, and the
 * only way to guarantee that is for the wider row to reuse the narrower one.
 * Spreading `toSummary` is what keeps the persisted `runMs` out of the public
 * contract and keeps an unpriced run's `costUsd` a number here exactly as it is
 * on `/runs`.
 *
 * @param record
 * @returns Detail view: the summary row plus `tools`, `pattern`,
 *   `patternDetail`, `toolingGap` and `msg`.
 */
export function toDetail(record: HarnessRunRecord,): HarnessRunDetail {
  return {
    ...toSummary(record,),
    tools: record.tools,
    pattern: record.pattern,
    patternDetail: record.patternDetail,
    toolingGap: record.toolingGap,
    msg: record.msg,
  };
}

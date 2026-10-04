// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Harness exec log record types.
 *
 * The TS interface is camelCase; the persisted JSONL uses snake_case wire names
 * so `.harness/executions.jsonl` greps the same as the agent ledger's
 * `.ledger.jsonl`. `serializeRun` / `deserializeRun` are the only two places
 * the two shapes meet.
 */
import { safeJsonParse, } from "../utils/safe-json";
import type { HarnessRunDetail, HarnessRunSummary, } from "./read-models";

/**
 * Every task type, as a runtime list. The union below is DERIVED from this so
 * the wire-side check in `deserializeRun` cannot drift from the type.
 */
export const HARNESS_TASK_TYPES = [
  "chat",
  "auto-gen",
  "aux",
  "embeddings",
  "rerank",
  "memory",
  "workflow",
  "handoff",
  "sandbox",
  "harness",
  "eval",
  "other",
] as const;

/** What a run was doing, independent of the model. */
export type HarnessTaskType = (typeof HARNESS_TASK_TYPES)[number];

/** Runtime membership test for the union, for values that came off the wire. */
const TASK_TYPE_SET: ReadonlySet<string> = new Set<string>(HARNESS_TASK_TYPES,);

/**
 * Coerce an untrusted wire value to a known task type.
 * @param v - the raw `task_type` from the JSONL
 * @returns the value when it is a union member, otherwise `"other"`.
 */
function toTaskType(v: unknown,): HarnessTaskType {
  return typeof v === "string" && TASK_TYPE_SET.has(v,) ? (v as HarnessTaskType) : "other";
}

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

/** Wire shape of one JSONL line (snake_case, stable, grep-friendly). */
interface HarnessRunWire {
  run_id: string;
  ts: string;
  run_ms: number;
  task: string;
  task_type: HarnessTaskType;
  model: string;
  tools: string[];
  tool_count: number;
  pattern: string;
  pattern_detail: string;
  result: HarnessResult;
  error: string | null;
  tooling_gap: string | null;
  cost_usd: number | null;
  tokens_in: number;
  tokens_out: number;
  branch: string | null;
  pid: number | null;
  git_sha: string | null;
  msg: string | null;
}

/**
 * Record → wire shape.
 * @param record
 * @returns The exact object `JSON.stringify` writes to the JSONL.
 */
export function serializeRun(record: HarnessRunRecord,): HarnessRunWire {
  return {
    run_id: record.runId,
    ts: record.ts,
    run_ms: record.runMs,
    task: record.task,
    task_type: record.taskType,
    model: record.model,
    tools: record.tools,
    tool_count: record.toolCount,
    pattern: record.pattern,
    pattern_detail: record.patternDetail,
    result: record.result,
    error: record.error,
    tooling_gap: record.toolingGap,
    cost_usd: record.costUsd,
    tokens_in: record.tokensIn,
    tokens_out: record.tokensOut,
    branch: record.branch,
    pid: record.pid,
    git_sha: record.gitSha,
    msg: record.msg,
  };
}

/**
 * Wire shape → record. Returns null for a line that does not parse or is
 * missing the identity fields — a torn write must not poison the read side.
 * @param line - One raw JSONL line.
 * @returns The record, or null when the line is unusable.
 */
export function deserializeRun(line: string,): HarnessRunRecord | null {
  // A torn or malformed line is an expected condition in an append-only log,
  // not an exception: safeJsonParse reports the failure so we can drop the
  // line instead of unwinding. It also collapses a huge line without a
  // stack, which is the hazard the safe-parse audit ticket tracks.
  const parsed = safeJsonParse<unknown>(line,);
  if (!parsed.ok) { return null; }
  if (typeof parsed.value !== "object" || parsed.value === null) { return null; }
  const w = parsed.value as Partial<HarnessRunWire>;
  if (typeof w.run_id !== "string" || typeof w.ts !== "string") { return null; }
  const str = (v: unknown,): string => (typeof v === "string" ? v : "");
  const num = (v: unknown,): number => (typeof v === "number" && Number.isFinite(v,) ? v : 0);
  // `??` only catches null/undefined, so a hand-written `"task_type": 123`
  // would sail through and then blow up in the stats sort's localeCompare.
  return {
    runId: w.run_id,
    ts: w.ts,
    runMs: num(w.run_ms,),
    task: str(w.task,),
    taskType: toTaskType(w.task_type,),
    model: str(w.model,),
    tools: Array.isArray(w.tools,) ? w.tools.filter((t,) => typeof t === "string") : [],
    toolCount: num(w.tool_count,),
    pattern: str(w.pattern,),
    patternDetail: str(w.pattern_detail,),
    result: w.result ?? "ok",
    error: typeof w.error === "string" ? w.error : null,
    toolingGap: typeof w.tooling_gap === "string" ? w.tooling_gap : null,
    // null/absent cost stays null — a 0 here would claim the call was free.
    costUsd: typeof w.cost_usd === "number" && Number.isFinite(w.cost_usd,) ? w.cost_usd : null,
    tokensIn: num(w.tokens_in,),
    tokensOut: num(w.tokens_out,),
    branch: typeof w.branch === "string" ? w.branch : null,
    pid: typeof w.pid === "number" && Number.isFinite(w.pid,) ? w.pid : null,
    gitSha: typeof w.git_sha === "string" ? w.git_sha : null,
    msg: typeof w.msg === "string" ? w.msg : null,
  };
}

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

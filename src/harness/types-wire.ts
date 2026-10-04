// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Harness exec log WIRE format: the snake_case shape written to
 * `.harness/executions.jsonl`, plus the two functions that translate between
 * it and the camelCase `HarnessRunRecord`.
 *
 * Split from `types.ts` because read and write are two concerns: that file
 * describes the record every consumer works in, this one describes the bytes
 * on disk. `serializeRun` / `deserializeRun` are the only two places the two
 * shapes meet, and they live here with both of them.
 *
 * `HARNESS_TASK_TYPES` lives here too: the union is derived from that runtime
 * list precisely so the wire-side check in `deserializeRun` cannot drift from
 * the type, so the list and the check belong in the same file. Everything
 * exported is re-exported from `types.ts`, so existing `from "./types"`
 * imports keep working.
 */
import { safeJsonParse, } from "../utils/safe-json";
import type { HarnessResult, HarnessRunRecord, } from "./types";

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
  /**
   * Absent on every line written before turn correlation existed, so the
   * parser must tolerate the key being missing entirely — not just null.
   */
  turn_id?: string | null;
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
    turn_id: record.turnId,
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
    // A line written before this key existed carries no `turn_id` at all, and
    // a hand-written one may carry anything: both mean "no turn", so neither
    // may fabricate an id or cost the whole line.
    turnId: typeof w.turn_id === "string" ? w.turn_id : null,
  };
}

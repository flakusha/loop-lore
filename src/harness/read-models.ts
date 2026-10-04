// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Harness read-model shapes: what the query side returns.
 *
 * Split from `types.ts` (the persisted run record + its wire format) because
 * those are two different concerns: this file describes READ output, that one
 * describes what gets WRITTEN to the JSONL. The two are re-exported from
 * `types.ts` so existing imports keep working.
 *
 * Fields here are nullable exactly as the wire allows: a hand-written or
 * legacy log line may have no branch, pid, or git sha.
 */
import type { HarnessResult, HarnessTaskType, } from "./types";

/** Row shape returned by `GET /api/v1/harness/runs` (no tool list, no pattern text). */
export interface HarnessRunSummary {
  runId: string;
  ts: string;
  durationMs: number;
  task: string;
  taskType: HarnessTaskType;
  model: string;
  toolCount: number;
  result: HarnessResult;
  error: string | null;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  branch: string | null;
  gitSha: string | null;
  pid: number | null;
}

/**
 * Row shape returned by `GET /api/v1/harness/runs/:runId` — the summary plus the
 * activity fields the summary drops.
 *
 * Extends {@link HarnessRunSummary} so both endpoints agree field for field on
 * the names and nullability an API consumer sees: the persisted `runMs` is
 * renamed to `durationMs` in `toSummary`, and an unpriced run's `costUsd` is
 * coalesced to 0 on that same path. A detail row must not reintroduce either
 * difference, so it inherits both from the summary rather than restating them.
 */
export interface HarnessRunDetail extends HarnessRunSummary {
  tools: string[];
  pattern: string;
  /** Free-text pattern note; "" when the run recorded none. Never null. */
  patternDetail: string;
  toolingGap: string | null;
  msg: string | null;
}

/** Filters accepted by `listRuns`. All fields are optional and AND together. */
export interface HarnessRunFilter {
  taskType?: HarnessTaskType;
  result?: HarnessResult;
  task?: string;
  model?: string;
}

/** Totals row of `GET /api/v1/harness/stats`. */
export interface HarnessTotals {
  runs: number;
  failures: number;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  avgMs: number;
}

/** Per-model rollup. */
export interface HarnessByModel {
  model: string;
  runs: number;
  failures: number;
  avgMs: number;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
}

/** Per-task-type rollup. */
export interface HarnessByTaskType {
  taskType: HarnessTaskType;
  runs: number;
  failures: number;
  avgMs: number;
}

/** Per-pattern rollup. */
export interface HarnessByPattern {
  pattern: string;
  runs: number;
  failures: number;
}

/** Tooling-gap counts (the RSI failure-mining feed). */
export interface HarnessToolingGap {
  toolingGap: string;
  count: number;
}

/** Full `GET /api/v1/harness/stats` payload. */
export interface HarnessStats {
  totals: HarnessTotals;
  byModel: HarnessByModel[];
  byTaskType: HarnessByTaskType[];
  byPattern: HarnessByPattern[];
  toolingGaps: HarnessToolingGap[];
}

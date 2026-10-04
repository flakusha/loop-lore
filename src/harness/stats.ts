// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Harness exec log — stats rollup.
 *
 * Pure math over the record window `query.ts` already bounded and parsed; this
 * module never touches the filesystem, so the two halves of the read side stay
 * independently testable.
 */
import type {
  HarnessByModel,
  HarnessByPattern,
  HarnessByTaskType,
  HarnessRunRecord,
  HarnessStats,
  HarnessToolingGap,
  HarnessTotals,
} from "./types";

/**
 * Mean of a summed millisecond total, or 0 when nothing was counted.
 * @param total - sum of the durations in the bucket
 * @param runs - number of runs in the bucket
 * @returns the rounded mean, or 0 when `runs` is 0 (no division by zero).
 */
function mean(total: number, runs: number,): number {
  return runs === 0 ? 0 : Math.round(total / runs,);
}

/**
 * Round a float sum to 4 decimals so cost rollups stay grep-stable.
 * @param n - the accumulated float sum
 * @returns the same value rounded to 4 decimal places.
 */
function round4(n: number,): number {
  return Math.round(n * 10_000,) / 10_000;
}

/**
 * Turn an accumulator map into sorted-ready API rows: drops the private `ms`
 * total and exposes it as `avgMs` instead. Shared by the per-model and
 * per-task-type rollups, which differ only in their sort key.
 * @param entries - accumulator map keyed by model name / task type
 * @returns the same rows without the private `ms` field, with `avgMs` filled in.
 */
function rollup<T extends { runs: number; avgMs: number; ms: number },>(
  entries: ReadonlyMap<string, T>,
): T[] {
  return [...entries.values(),].map((entry,) => {
    const { ms, ...row } = entry;
    return { ...row, avgMs: mean(ms, row.runs,), } as T;
  },);
}

/**
 * Increment a counter row: `runs`, plus `failures` when the run did not succeed.
 * @param row - the mutable rollup row to increment in place
 * @param row.runs - incremented for every run counted
 * @param row.failures - incremented when the run did not succeed
 * @param row.ms - accumulated run duration in milliseconds
 * @param runMs - duration of the run, added to the row's `ms` accumulator
 * @param failed - true when the run did not end in `ok`
 * @returns nothing; mutates `row`.
 */
function bump(row: { runs: number; failures: number; ms: number }, runMs: number, failed: boolean,): void {
  row.runs++;
  if (failed) { row.failures++; }
  row.ms += runMs;
}

/**
 * Roll up a record window into totals + per-model / per-task-type / per-pattern
 * counts and tooling-gap counts.
 * @param records - the bounded, newest-first window from `query.ts`
 * @returns the stats payload; all-zero when the window is empty.
 */
export function rollupStats(records: readonly HarnessRunRecord[],): HarnessStats {
  const totals: HarnessTotals & { ms: number } = {
    runs: 0,
    failures: 0,
    costUsd: 0,
    tokensIn: 0,
    tokensOut: 0,
    avgMs: 0,
    ms: 0,
  };

  const models = new Map<string, HarnessByModel & { ms: number }>();
  const taskTypes = new Map<string, HarnessByTaskType & { ms: number }>();
  const patterns = new Map<string, HarnessByPattern>();
  const gaps = new Map<string, number>();

  for (const record of records) {
    const failed = record.result !== "ok";
    totals.runs++;
    if (failed) { totals.failures++; }
    totals.ms += record.runMs;
    // A null cost is unknown, not zero: it contributes nothing to the sum and
    // the rollup reports the cost of the runs that declared a price. Rounding
    // happens once at the end — per-record rounding drops every sub-$0.00005
    // call to zero, so 20k cheap runs would roll up as free.
    if (record.costUsd !== null) { totals.costUsd += record.costUsd; }
    totals.tokensIn += record.tokensIn;
    totals.tokensOut += record.tokensOut;

    const modelKey = record.model === "" ? "(unknown)" : record.model;
    let model = models.get(modelKey,);
    if (model === undefined) {
      model = { model: modelKey, runs: 0, failures: 0, avgMs: 0, costUsd: 0, tokensIn: 0, tokensOut: 0, ms: 0, };
      models.set(modelKey, model,);
    }

    bump(model, record.runMs, failed,);
    if (record.costUsd !== null) { model.costUsd += record.costUsd; }
    model.tokensIn += record.tokensIn;
    model.tokensOut += record.tokensOut;

    let taskType = taskTypes.get(record.taskType,);
    if (taskType === undefined) {
      taskType = { taskType: record.taskType, runs: 0, failures: 0, avgMs: 0, ms: 0, };
      taskTypes.set(record.taskType, taskType,);
    }

    bump(taskType, record.runMs, failed,);

    const patternKey = record.pattern === "" ? "(none)" : record.pattern;
    let pattern = patterns.get(patternKey,);
    if (pattern === undefined) {
      pattern = { pattern: patternKey, runs: 0, failures: 0, };
      patterns.set(patternKey, pattern,);
    }

    pattern.runs++;
    if (failed) { pattern.failures++; }

    if (record.toolingGap !== null && record.toolingGap !== "") {
      gaps.set(record.toolingGap, (gaps.get(record.toolingGap,) ?? 0) + 1,);
    }
  }

  // Round once, on the accumulated float — see the note in the loop above.
  totals.avgMs = mean(totals.ms, totals.runs,);
  totals.costUsd = round4(totals.costUsd,);
  for (const model of models.values()) { model.costUsd = round4(model.costUsd,); }
  const byModel: HarnessByModel[] = rollup(models,)
    .sort((a, b,) => b.runs - a.runs || a.model.localeCompare(b.model,));

  const byTaskType: HarnessByTaskType[] = rollup(taskTypes,)
    .sort((a, b,) => b.runs - a.runs || a.taskType.localeCompare(b.taskType,));

  const byPattern: HarnessByPattern[] = [...patterns.values(),]
    .sort((a, b,) => b.runs - a.runs || a.pattern.localeCompare(b.pattern,));

  const toolingGaps: HarnessToolingGap[] = [...gaps.entries(),]
    .map(([toolingGap, count,],) => ({ toolingGap, count, }))
    .sort((a, b,) => b.count - a.count || a.toolingGap.localeCompare(b.toolingGap,));

  const { ms: _ms, ...totalsOut } = totals;
  return { totals: totalsOut, byModel, byTaskType, byPattern, toolingGaps, };
}

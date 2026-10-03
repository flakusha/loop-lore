// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * AUX Pipeline — Prompt-Eval Scoring
 *
 * Pure functions: per-task scoring of (expected, actual) label pairs and
 * baseline regression diffing. No I/O, no provider access — unit-testable
 * in isolation; the runner and CLI do the orchestration.
 */
import type { AuxTaskName, } from "../types";

/** Per-task aggregate over a corpus. */
export interface TaskReport {
  task: AuxTaskName;
  total: number;
  correct: number;
  /** Fixtures where the classifier returned null / failed to parse. */
  parseNull: number;
}

/** Stored baseline entry per task. */
export interface BaselineEntry {
  accuracy: number;
  parseNullRate: number;
}

/** Stored baseline: task → metrics. */
export type Baseline = Record<string, BaselineEntry>;

/** One regression between the current run and the baseline. */
export interface BaselineRegression {
  task: AuxTaskName;
  kind: "accuracy-drop" | "parse-null-increase";
  baseline: number;
  current: number;
}

/**
 * Score one fixture outcome.
 * @param expected - Semantically correct label from the corpus
 * @param actualLabel - Extracted label, or null when the classifier returned null
 * @returns true when the label matches; null actuals always score false
 */
export function scoreFixture(expected: string, actualLabel: string | null,): boolean {
  return actualLabel !== null && actualLabel === expected;
}

/**
 * One fixture result awaiting scoring.
 */
export interface FixtureResult {
  expected: string;
  actual: string | null;
}

/**
 * Aggregate fixture results into a per-task report.
 * @param task - Task under test
 * @param results - One entry per fixture (actual null = classifier returned null)
 * @returns Aggregate report (accuracy + parse-null counts)
 */
export function scoreTask(task: AuxTaskName, results: readonly FixtureResult[],): TaskReport {
  const total = results.length;
  const parseNull = results.filter((r,) => r.actual === null).length;
  const correct = results.filter((r,) => scoreFixture(r.expected, r.actual,)).length;
  return { task, total, correct, parseNull, };
}

/**
 * Derived metrics for a report.
 * @param report - Aggregate report
 * @returns Accuracy and parse-null rate in [0, 1]; 0 accuracy on empty corpus
 */
export function reportMetrics(report: TaskReport,): BaselineEntry {
  return {
    accuracy: report.total === 0 ? 0 : report.correct / report.total,
    parseNullRate: report.total === 0 ? 0 : report.parseNull / report.total,
  };
}

/**
 * Diff current reports against the stored baseline.
 * @param reports - Current per-task reports
 * @param baseline - Stored baseline (task → metrics)
 * @returns Regressions: any accuracy drop or parse-null-rate increase.
 *   Tasks absent from the baseline are skipped (first run seeds it).
 */
export function diffBaseline(
  reports: readonly TaskReport[],
  baseline: Baseline,
): BaselineRegression[] {
  const regressions: BaselineRegression[] = [];
  for (const report of reports) {
    const stored = baseline[report.task];
    if (!stored) { continue; }
    const current = reportMetrics(report,);
    if (current.accuracy < stored.accuracy) {
      regressions.push({
        task: report.task,
        kind: "accuracy-drop",
        baseline: stored.accuracy,
        current: current.accuracy,
      },);
    }
    if (current.parseNullRate > stored.parseNullRate) {
      regressions.push({
        task: report.task,
        kind: "parse-null-increase",
        baseline: stored.parseNullRate,
        current: current.parseNullRate,
      },);
    }
  }
  return regressions;
}

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared helpers for story subsystem modules.
 *
 * Extracted from synthetic/runner.ts and quest-engine.ts to eliminate
 * repeated patterns (Dedup Phase 11).
 */
// ── Synthetic Runner Types ───────────────────────────────────
/** Common return shape for synthetic test case execution methods. */
export interface CaseResult {
  status: "passed" | "failed" | "skipped";
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
  reason?: string;
}
/** Build a skipped-case result with an optional actual payload. */
export function skippedResult(
  expected: Record<string, unknown>,
  reason: string,
  actual: Record<string, unknown> = {},
): CaseResult {
  return { status: "skipped", expected, actual, reason, };
}

/**
 * Collect scores by evaluating a callback `iterations` times, then return
 * the score array and the variance (max − min).
 */
export function collectScoresAndVariance(
  evaluate: (i: number,) => number,
  iterations: number,
): { scores: number[]; variance: number } {
  const scores: number[] = [];
  for (let i = 0; i < iterations; i++) {
    scores.push(evaluate(i,),);
  }
  const variance = Math.max(...scores,) - Math.min(...scores,);
  return { scores, variance, };
}

/**
 * Build a pass/fail CaseResult for quality score variance checks.
 *
 * @param scores  - collected score array
 * @param variance - max − min spread
 * @param passed   - whether the check passed
 * @param expected - the case's expected map
 * @param reason   - failure reason string (omit when passed)
 */
export function varianceResult(
  scores: number[],
  variance: number,
  passed: boolean,
  expected: Record<string, unknown>,
  reason?: string,
): CaseResult {
  return {
    status: passed ? "passed" : "failed",
    expected,
    actual: { scores, variance, },
    reason: passed ? undefined : reason,
  };
}

/**
 * Count results by status, returning `{ passed, failed, skipped }`.
 */
export function countByStatus(results: { status: string }[],): {
  passed: number;
  failed: number;
  skipped: number;
} {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const r of results) {
    switch (r.status) {
      case "passed": {
        passed++;
        break;
      }
      case "failed": {
        failed++;
        break;
      }
      case "skipped": {
        skipped++;
        break;
      }
    }
  }
  return { passed, failed, skipped, };
}

// ── Quest Engine Helpers ─────────────────────────────────────

export * from "./quest-engine-utils";

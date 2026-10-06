// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * Tests for the advisory gate mechanism: advisory gates RUN and REPORT
 * but their failure does NOT fail the run. Proves:
 *   (a) a failing advisory gate does NOT fail the run
 *   (b) a failing blocking gate DOES fail the run
 *   (c) advisory failures appear in the report
 *
 * These are unit-level tests on `reportResults` and `buildReport` — no
 * subprocess, no gate execution.
 */

import { describe, expect, test, } from "bun:test";
import { ADVISORY_GATES, } from "./check/parallel/gates.mjs";
import { buildReport, reportResults, } from "./check/parallel/report.mjs";
import { runCheck, } from "./check/parallel/runner.mjs";

// ── Helpers ──────────────────────────────────────────────────────

function makeResult(name, { passed = true, skipped = false, advisory = false, timedOut = false, } = {},) {
  return {
    name,
    command: `bun run ${name}`,
    passed,
    skipped,
    advisory,
    timedOut,
    output: passed ? "" : `fake failure output for ${name}`,
    exitCode: passed ? 0 : 1,
    durationMs: 100,
    truncated: false,
  };
}

// Capture console.log calls from reportResults.
function captureOutput(fn,) {
  const original = console.log;
  const lines = [];
  console.log = (...args) => {
    lines.push(args.join(" ",),);
  };
  try {
    fn();
  } finally {
    console.log = original;
  }
  return lines.join("\n",);
}

// ── Tests ────────────────────────────────────────────────────────

describe("ADVISORY_GATES registry", () => {
  test("contains the 5 churn gates", () => {
    expect(ADVISORY_GATES.has("plan - validate",),).toBe(true,);
    expect(ADVISORY_GATES.has("plan - ticket index (sync)",),).toBe(true,);
    expect(ADVISORY_GATES.has("code-map - freshness",),).toBe(true,);
    expect(ADVISORY_GATES.has("plan - matrix",),).toBe(true,);
    expect(ADVISORY_GATES.has("jscpd ratchet",),).toBe(true,);
  });

  test("does not contain blocking gates", () => {
    expect(ADVISORY_GATES.has("typecheck - backend",),).toBe(false,);
    expect(ADVISORY_GATES.has("lint - eslint",),).toBe(false,);
    expect(ADVISORY_GATES.has("test - unit",),).toBe(false,);
  });
});

describe("advisory gate failure does NOT fail the run", () => {
  test("failing advisory gate returns 0 failed", () => {
    const results = [
      makeResult("plan - validate", { passed: false, advisory: true, },),
      makeResult("lint - eslint", { passed: true, },),
    ];
    let failed;
    captureOutput(() => {
      failed = reportResults(results,);
    },);
    expect(failed,).toBe(0,);
  });

  test("failing blocking gate returns 1 failed", () => {
    const results = [
      makeResult("lint - eslint", { passed: false, },),
      makeResult("plan - validate", { passed: true, advisory: true, },),
    ];
    let failed;
    captureOutput(() => {
      failed = reportResults(results,);
    },);
    expect(failed,).toBe(1,);
  });

  test("mix: advisory fail + blocking fail = 1 failed (only blocking counts)", () => {
    const results = [
      makeResult("plan - validate", { passed: false, advisory: true, },),
      makeResult("jscpd ratchet", { passed: false, advisory: true, },),
      makeResult("lint - eslint", { passed: false, },),
    ];
    let failed;
    captureOutput(() => {
      failed = reportResults(results,);
    },);
    expect(failed,).toBe(1,);
  });
});

describe("advisory failures appear in the report", () => {
  test("reportResults prints ADVISORY line for failing advisory gate", () => {
    const results = [
      makeResult("plan - validate", { passed: false, advisory: true, },),
    ];
    const output = captureOutput(() => {
      reportResults(results,);
    },);
    expect(output,).toContain("ADVISORY: plan - validate",);
    expect(output,).not.toContain("FAIL: plan - validate",);
  });

  test("summary shows Advisory count", () => {
    const results = [
      makeResult("plan - validate", { passed: false, advisory: true, },),
      makeResult("jscpd ratchet", { passed: false, advisory: true, },),
      makeResult("lint - eslint", { passed: true, },),
    ];
    const output = captureOutput(() => {
      reportResults(results,);
    },);
    expect(output,).toContain("Advisory: 2",);
    expect(output,).toContain("Failed: 0",);
  });

  test("buildReport marks advisory checks and excludes them from failed count", () => {
    const results = [
      makeResult("plan - validate", { passed: false, advisory: true, },),
      makeResult("lint - eslint", { passed: true, },),
    ];
    const report = buildReport({ exitCode: 0, checks: results, nonBlocking: [], gpgPrecheck: null, },);
    expect(report.passed,).toBe(true,);
    expect(report.summary.advisory,).toBe(1,);
    expect(report.summary.failed,).toBe(0,);
    expect(report.checks[0].advisory,).toBe(true,);
    expect(report.checks[1].advisory,).toBe(false,);
  });

  test("buildReport failed count includes blocking failures only", () => {
    const results = [
      makeResult("plan - validate", { passed: false, advisory: true, },),
      makeResult("lint - eslint", { passed: false, },),
    ];
    const report = buildReport({ exitCode: 1, checks: results, nonBlocking: [], gpgPrecheck: null, },);
    expect(report.passed,).toBe(false,);
    expect(report.summary.advisory,).toBe(1,);
    expect(report.summary.failed,).toBe(1,);
  });

  test("passing advisory gate does not corrupt failedCount", () => {
    const results = [
      makeResult("plan - validate", { passed: true, advisory: true, },),
      makeResult("lint - eslint", { passed: true, },),
    ];
    const report = buildReport({ exitCode: 0, checks: results, nonBlocking: [], gpgPrecheck: null, },);
    expect(report.passed,).toBe(true,);
    expect(report.summary.advisory,).toBe(0,);
    expect(report.summary.failed,).toBe(0,);
    expect(report.summary.passed,).toBe(2,);
  });

  test("skipped gates are not affected by advisory logic", () => {
    const results = [
      makeResult("plan - ticket index (sync)", { passed: false, skipped: true, advisory: true, },),
      makeResult("lint - eslint", { passed: true, },),
    ];
    let failed;
    const output = captureOutput(() => {
      failed = reportResults(results,);
    },);
    expect(failed,).toBe(0,);
    expect(output,).toContain("SKIP:",);
    expect(output,).not.toContain("ADVISORY:",);
  });
});

// ── runCheck wiring ──────────────────────────────────────────────
//
// The tests above all feed reportResults hand-built results that ALREADY carry
// `advisory`, so they cannot catch the runner dropping the field. Every case
// below drives the real runCheck with a trivial shell command and asserts on the
// object it returns.
describe("runCheck sets the advisory flag from the gate registry", () => {
  test("a failing ADVISORY_GATES member comes back advisory", async () => {
    const result = await runCheck("plan - validate", "exit 1",);
    expect(result.passed,).toBe(false,);
    expect(result.advisory,).toBe(true,);

    // The consequence that matters: a failing advisory gate must not fail the
    // run. This is the regression -- with `advisory` dropped, summary.advisory
    // was 0, failed was 3, and `bun run check` exited 1 on nothing actionable.
    const report = buildReport({ exitCode: 0, checks: [result,], nonBlocking: [], gpgPrecheck: null, },);
    expect(report.summary.advisory,).toBe(1,);
    expect(report.summary.failed,).toBe(0,);
  });

  test("a failing blocking gate comes back NOT advisory", async () => {
    const result = await runCheck("lint - eslint", "exit 1",);
    expect(result.passed,).toBe(false,);
    expect(result.advisory,).toBe(false,);

    const report = buildReport({ exitCode: 1, checks: [result,], nonBlocking: [], gpgPrecheck: null, },);
    expect(report.summary.advisory,).toBe(0,);
    expect(report.summary.failed,).toBe(1,);
  });

  test("every advisory member is advisory, every other gate is not", async () => {
    for (const name of ADVISORY_GATES) {
      const result = await runCheck(name, "exit 1",);
      expect({ name, advisory: result.advisory, },).toEqual({ name, advisory: true, },);
    }
    const blocking = await runCheck("typecheck - backend", "exit 1",);
    expect(blocking.advisory,).toBe(false,);
  });

  test("a passing advisory gate is neither failed nor advisory-counted", async () => {
    const result = await runCheck("jscpd ratchet", "exit 0",);
    expect(result.passed,).toBe(true,);
    expect(result.advisory,).toBe(true,);

    const report = buildReport({ exitCode: 0, checks: [result,], nonBlocking: [], gpgPrecheck: null, },);
    expect(report.summary.advisory,).toBe(0,);
    expect(report.summary.failed,).toBe(0,);
    expect(report.summary.passed,).toBe(1,);
  });
});

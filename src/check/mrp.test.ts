// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * RESOURCE CONTRACT: pure in-memory fixtures only — no DB, disk, env, timers
 * or shared state. Deterministic and order-independent under `--isolate`.
 */
import { describe, expect, test, } from "bun:test";

import { buildMrp, type CheckReport, type CheckReportCheck, } from "./mrp";

const checks: CheckReportCheck[] = [
  {
    command: "tsgo",
    durationMs: 200,
    exitCode: 0,
    name: "typecheck - backend",
    passed: true,
  },
  {
    command: "eslint",
    durationMs: 300,
    exitCode: 0,
    name: "lint - eslint",
    passed: true,
  },
  {
    command: "bun test",
    durationMs: 500,
    exitCode: 0,
    name: "tests - unit (src)",
    passed: true,
  },
];

const fixture: CheckReport = {
  branch: "mrp-generator",
  checks,
  exitCode: 0,
  generatedAt: "2026-11-23T10:00:00.000Z",
  gitDirty: false,
  gitHead: "509b7f7ff",
  passed: true,
  runId: "1234-abc",
  schemaVersion: 2,
  summary: {
    advisory: 0,
    durationMs: 1000,
    failed: 0,
    passed: 3,
    skipped: 0,
    total: 3,
  },
};

const GOLDEN_HASH = "16c7217feaf5381e9a1e69cd4a7da124af0367d108e1da5b250d106b2e85f4bd";

describe("buildMrp", () => {
  test("produces a stable golden hash for a green report", () => {
    const first = buildMrp(fixture,);
    const second = buildMrp(structuredClone(fixture,),);

    expect(first.hash,).toBe(GOLDEN_HASH,);
    expect(second.hash,).toBe(GOLDEN_HASH,);
    expect(first.verdict,).toBe("ready",);
    expect(first.unavailable,).toEqual(["hygiene", "rationale",],);
    expect(first.axes.hygiene.reason,).toBe(
      "check report records gate outcomes, not lint or style findings",
    );

    expect(first.summary.durationMs,).toBe(1000,);
  });

  test("blocks on a failing blocking gate", () => {
    const failing: CheckReport = {
      ...fixture,
      checks: [
        ...checks,
        {
          command: "bun test",
          durationMs: 1,
          exitCode: 1,
          name: "tests - e2e (inproc)",
          passed: false,
        },
      ],
      summary: { ...fixture.summary, failed: 1, passed: 3, total: 4, },
    };

    const mrp = buildMrp(failing,);

    expect(mrp.verdict,).toBe("blocked",);
    expect(mrp.blockingFailures,).toEqual(["tests - e2e (inproc)",],);
    expect(mrp.advisoryFailures,).toEqual([],);
  });

  test("treats advisory failures and skipped gates as caveats", () => {
    const caveated: CheckReport = {
      ...fixture,
      checks: [
        ...checks,
        {
          advisory: true,
          command: "giwt plan",
          durationMs: 1,
          exitCode: 1,
          name: "plan - validate",
          passed: false,
        },
      ],
      gitDirty: true,
      summary: { ...fixture.summary, advisory: 1, total: 4, },
    };

    const mrp = buildMrp(caveated,);

    expect(mrp.verdict,).toBe("ready-with-caveats",);
    expect(mrp.advisoryFailures,).toEqual(["plan - validate",],);
    expect(mrp.blockingFailures,).toEqual([],);
    expect(mrp.axes.accountability.evidence,).toContain("dirty tree",);
  });
});

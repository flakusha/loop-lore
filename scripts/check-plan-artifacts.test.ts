// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { ARTIFACTS, checkAll, type Runner, verdict, } from "./check-plan-artifacts.js";

/**
 * Gate contract for scripts/check-plan-artifacts.ts.
 *
 * Pure-function tests with an injected runner — no subprocess, no repo state.
 */

const PASS: Runner = () => ({ exit: 0, detail: "", });

describe("checkAll", () => {
  test("ok when every check exits 0", () => {
    const results = checkAll(ARTIFACTS.slice(0, 2,), PASS,);
    expect(results.every((r,) => r.ok),).toBe(true,);
  });
  test("marks the failing artifact and keeps the rest", () => {
    const run: Runner = (check,) =>
      check.join(" ",).includes("matrix",) ? { exit: 1, detail: "stale", } : { exit: 0, detail: "", };
    const results = checkAll(ARTIFACTS.slice(0, 2,), run,);
    expect(results.map((r,) => r.ok),).toEqual([true, false,],);
    expect(results[1]?.detail,).toBe("stale",);
  });
  test("a throwing runner becomes a failure, not a crash", () => {
    const run: Runner = () => {
      throw new Error("spawn failed",);
    };
    const results = checkAll(ARTIFACTS.slice(0, 1,), run,);
    expect(results[0]?.ok,).toBe(false,);
  });
});

describe("verdict", () => {
  test("clean results exit 0 with ok lines", () => {
    const report = verdict(checkAll(ARTIFACTS.slice(0, 1,), PASS,),);
    expect(report.exitCode,).toBe(0,);
    expect(report.lines[0]?.startsWith("ok ",),).toBe(true,);
  });
  test("any stale artifact exits 1 with a regenerate hint", () => {
    const run: Runner = () => ({ exit: 1, detail: "missing — run `x` to generate", });
    const report = verdict(checkAll(ARTIFACTS.slice(0, 1,), run,),);
    expect(report.exitCode,).toBe(1,);
    expect(report.lines[0],).toContain("STALE",);
  });
});

describe("artifact table", () => {
  test("covers the spec's generated set with bun checks", () => {
    expect(ARTIFACTS.length,).toBeGreaterThanOrEqual(6,);
    for (const artifact of ARTIFACTS) {
      expect(artifact.check[0],).toBe("bun",);
      expect(artifact.file.startsWith(".plan/",),).toBe(true,);
    }
  });
});

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { linkageVerdict, } from "./check-plan-linkage.js";
import { ADVISORY_GATES, checks, } from "./check/parallel/gate-table.mjs";
import type { LinkageReport, } from "./plan-entry-map.js";

/**
 * Gate contract for scripts/check-plan-linkage.ts.
 *
 * Pure-function tests over fabricated reports — no filesystem, no fixtures.
 */

function report(over: Partial<LinkageReport>,): LinkageReport {
  return { lanes: [], scoped: [], drifts: [], warnings: [], ...over, };
}

describe("linkageVerdict", () => {
  test("clean report exits 0 and counts bindings", () => {
    const verdict = linkageVerdict(report({
      scoped: [{ file: "a.md", title: "a", status: "open", epic: "e", extid: "A", indexTitle: "a", gitIssue: "1", },],
    },),);
    expect(verdict.exitCode,).toBe(0,);
    expect(verdict.lines,).toContain("1 scoped tickets bound to the index",);
  });
  test("unresolvable lanes warn but still exit 0", () => {
    const verdict = linkageVerdict(
      report({ warnings: ["LANE-old.md: claim TASK-GHOST resolves to no ticket file",], },),
    );
    expect(verdict.exitCode,).toBe(0,);
    expect(verdict.lines.some((l,) => l.startsWith("warning:",)),).toBe(true,);
  });
  test("canonical-id drift exits 1", () => {
    const verdict = linkageVerdict(report({
      drifts: [{ file: "TASK-x.md", problems: ["filename slug vs H1",], },],
    },),);
    expect(verdict.exitCode,).toBe(1,);
    expect(verdict.lines.some((l,) => l.startsWith("drift:",)),).toBe(true,);
  });
});

describe("gate registration", () => {
  test("artifacts gate exists and is advisory", () => {
    expect(checks["plan - artifacts"],).toBe("bun run plan:artifacts:check",);
    expect(ADVISORY_GATES.has("plan - artifacts",),).toBe(true,);
  });
});

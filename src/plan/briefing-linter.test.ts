// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { lintBriefing, } from "./briefing-linter";

/** Minimal fully-actionable ticket; every axis is present. */
const GOOD = [
  "## Summary",
  "Add a scoped token for report ingest.",
  "",
  "## Context",
  "Extends epic-recursive-self-improvement via src/agent/api/auth.ts.",
  "",
  "## Strategic Advice",
  "Reuse the existing guard factory; no new middleware.",
  "",
  "## Risks",
  "Collector policy is operator-owned.",
  "",
  "## Acceptance Criteria",
  "- [ ] Token scope validates in <=500ms",
  "- [ ] At least 3 tests pass",
  "",
].join("\n",);

/** Remove one named section from a ticket. */
function without(ticket: string, heading: string,): string {
  const lines = ticket.split("\n",);
  const start = lines.findIndex((line,) => line === `## ${heading}`);
  if (start < 0) { return ticket; }
  let end = start + 1;
  while (end < lines.length && !lines[end]?.startsWith("## ",)) { end += 1; }
  return lines.filter((_, i,) => i < start || i >= end).join("\n",);
}

describe("lintBriefing axes", () => {
  test("a complete ticket scores 5 and is actionable", () => {
    const result = lintBriefing(GOOD,);

    expect(result.score,).toBe(5,);
    expect(result.verdict,).toBe("actionable",);
    expect(result.suggestions,).toEqual([],);
  });

  test("missing strategy scores 4 but still suggests a fix", () => {
    const result = lintBriefing(without(GOOD, "Strategic Advice",),);

    expect(result.axes.strategy,).toBe(false,);
    expect(result.score,).toBe(4,);
    expect(result.suggestions.some((s,) => s.includes("Strategic Advice",)),).toBe(true,);
  });

  test("three missing axes produce a marginal verdict", () => {
    const ticket = without(without(without(GOOD, "Strategic Advice",), "Risks",), "Context",);
    const result = lintBriefing(ticket,);

    expect(result.score,).toBe(2,);
    expect(result.verdict,).toBe("reject",);
  });

  test("a BUG ticket is exempt from the strategy axis", () => {
    const ticket = without(GOOD, "Strategic Advice",);
    const result = lintBriefing(ticket, { kind: "BUG", },);

    expect(result.axes.strategy,).toBe(true,);
    expect(result.score,).toBe(5,);
  });

  test("context without a cross-reference fails that axis", () => {
    const ticket = GOOD.replace(
      "Extends epic-recursive-self-improvement via src/agent/api/auth.ts.",
      "General background text.",
    );

    const result = lintBriefing(ticket,);

    expect(result.axes.context,).toBe(false,);
    expect(result.suggestions.some((s,) => s.includes("Context",)),).toBe(true,);
  });

  test("the generator's (none captured) marker counts as empty", () => {
    const ticket = GOOD.replace("Add a scoped token for report ingest.", "(none captured)",);
    const result = lintBriefing(ticket,);

    expect(result.axes.what,).toBe(false,);
  });

  test("Notes / Verification satisfies gotchas but not strategy", () => {
    const ticket = without(without(GOOD, "Strategic Advice",), "Risks",).replace(
      "## Acceptance Criteria",
      "## Notes / Verification\nVerified manually.\n\n## Acceptance Criteria",
    );

    const result = lintBriefing(ticket,);

    expect(result.axes.gotchas,).toBe(true,);
    expect(result.axes.strategy,).toBe(false,);
  });

  test("acceptance criteria without a checkbox fails what and testability", () => {
    const ticket = GOOD.replace("- [ ] Token scope validates in <=500ms", "Token scope validates in <=500ms",).replace(
      "- [ ] At least 3 tests pass",
      "At least 3 tests pass",
    );

    const result = lintBriefing(ticket,);

    expect(result.axes.what,).toBe(false,);
    expect(result.axes.testability,).toBe(false,);
  });

  test("checkboxes without measurable thresholds still get a specific suggestion", () => {
    const ticket = GOOD.replace("in <=500ms", "correctly",).replace("At least 3 tests pass", "Tests pass",);
    const result = lintBriefing(ticket,);

    expect(result.axes.testability,).toBe(true,);
    expect(result.suggestions.some((s,) => s.includes("measurable",)),).toBe(true,);
  });
});

describe("lintBriefing performance", () => {
  test("a large ticket is scored well under 200ms", () => {
    const ticket = `${GOOD}\n${"filler line\n".repeat(1000,)}`;
    const started = performance.now();
    lintBriefing(ticket,);

    expect(performance.now() - started,).toBeLessThan(200,);
  });
});

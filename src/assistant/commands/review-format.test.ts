// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for the shared review-report formatter. */
import { describe, expect, test, } from "bun:test";
import { formatReviewReport, type ReviewIssue, } from "./review-format";

describe("formatReviewReport", () => {
  test("clean report celebrates the entity", () => {
    const out = formatReviewReport("Character", "Lyra", [],);
    expect(out,).toContain("**Character Review: Lyra**",);
    expect(out,).toContain("well-defined",);
  });

  test("groups by severity with counts and summary", () => {
    const issues: ReviewIssue[] = [
      { field: "name", issue: "missing", severity: "error", },
      { field: "avatar", issue: "blurry", severity: "warning", },
      { field: "lore", issue: "could expand", severity: "info", },
    ];
    const out = formatReviewReport("World", "Aether", issues,);
    expect(out,).toContain("**Errors (1):**",);
    expect(out,).toContain("- ❌ name: missing",);
    expect(out,).toContain("**Warnings (1):**",);
    expect(out,).toContain("- ⚠️ avatar: blurry",);
    expect(out,).toContain("**Suggestions (1):**",);
    expect(out,).toContain("- 💡 lore: could expand",);
    expect(out,).toContain("**Summary:** 1 errors, 1 warnings, 1 suggestions",);
  });

  test("omits empty severity sections", () => {
    const out = formatReviewReport("Location", "Tavern", [
      { field: "name", issue: "missing", severity: "error", },
    ],);
    expect(out,).toContain("**Errors (1):**",);
    expect(out,).not.toContain("Warnings",);
    expect(out,).not.toContain("Suggestions",);
  });
});

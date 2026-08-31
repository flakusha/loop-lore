// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression: characters-traits renderAspirations must escape the goal
 * field before interpolating into innerHTML. Tracked in
 * TASK-character-traits-page-injects-unescaped-goal-into-innerhtml.
 *
 * The shared escapeHtml() uses DOM APIs (textContent + getHTML) that
 * Bun's test environment does not implement, so we verify the source
 * level guarantee (the fix) rather than the rendered output. A
 * complementary browser-level smoke test lives in tests/e2e/.
 */
import { describe, expect, test, } from "bun:test";
import { readFileSync, } from "fs";
import { join, } from "path";

describe("characters-traits XSS hardening", () => {
  test("renderAspirations wraps a.goal in escapeHtml() before interpolation", () => {
    const src = readFileSync(join(import.meta.dir, "characters-traits.ts",), "utf8",);
    const start = src.indexOf("export function renderAspirations",);
    expect(start,).toBeGreaterThanOrEqual(0,);
    // Slice just the function body (up to the next top-level brace closing it).
    const body = src.slice(start, start + 4000,);
    // Must not contain the unsafe bare interpolation `value="${a.goal}"`.
    expect(body,).not.toMatch(/value="\$\{\s*a\.goal\s*\}"/,);
    // Must contain the safe escapeHtml(a.goal) interpolation (possibly across lines).
    expect(body,).toMatch(/value="\$\{\s*escapeHtml\(\s*a\.goal\s*,\s*\)\s*\}"/,);
  });
});

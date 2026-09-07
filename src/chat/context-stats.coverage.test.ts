// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Context-stats coverage — token accounting with explicit counts vs
 * estimation, threshold mapping (including custom overrides), section
 * breakdowns with dropped sections, and remaining-budget clamping.
 */
import { describe, expect, test, } from "bun:test";
import {
  availableTokens,
  computeContextStats,
  computeSections,
} from "./context-stats.js";
import { estimateTokens, } from "./token-utils.js";

describe("computeContextStats", () => {
  test("empty history uses zero tokens and stays healthy", () => {
    const s = computeContextStats([], 32_000,);
    expect(s.used_tokens,).toBe(0,);
    expect(s.max_tokens,).toBe(32_000,);
    expect(s.percentage,).toBe(0,);
    expect(s.threshold,).toBe("healthy",);
    expect(s.will_trim,).toBe(false,);
  });

  test("prefers explicit token counts over estimation", () => {
    const s = computeContextStats([{ content: "hi", tokenCount: 42, },], 100,);
    expect(s.used_tokens,).toBe(42,);
    expect(s.percentage,).toBe(42,);
  });

  test("estimates tokens when no count is given", () => {
    const content = "hello world";
    const s = computeContextStats([{ content, },], 1000,);
    expect(s.used_tokens,).toBe(estimateTokens(content,),);
  });

  test("zero tokenCount falls back to estimation (falsy branch)", () => {
    const content = "hello world";
    const s = computeContextStats([{ content, tokenCount: 0, },], 1000,);
    expect(s.used_tokens,).toBe(estimateTokens(content,),);
  });

  test("imminent usage sets will_trim", () => {
    const s = computeContextStats([{ content: "x", tokenCount: 990, },], 1000,);
    expect(s.percentage,).toBe(99,);
    expect(s.threshold,).toBe("imminent",);
    expect(s.will_trim,).toBe(true,);
  });

  test("custom thresholds remap the state", () => {
    const s = computeContextStats([{ content: "x", tokenCount: 50, },], 100, {
      warning: 10,
      critical: 20,
      imminent: 90,
    },);
    expect(s.threshold,).toBe("critical",);
    expect(s.will_trim,).toBe(false,);
  });

  test("zero max tokens yields 0% instead of NaN", () => {
    const s = computeContextStats([{ content: "x", tokenCount: 10, },], 0,);
    expect(s.percentage,).toBe(0,);
    expect(s.threshold,).toBe("healthy",);
  });

  test("usage above the budget reports over 100%", () => {
    const s = computeContextStats([{ content: "x", tokenCount: 150, },], 100,);
    expect(s.percentage,).toBe(150,);
    expect(s.threshold,).toBe("imminent",);
  });
});

describe("computeSections", () => {
  test("dropped sections are excluded", () => {
    const out = computeSections(
      [
        { name: "lore", tokens: 200, dropped: false, },
        { name: "memories", tokens: 800, dropped: true, },
      ],
      1000,
    );
    expect(out,).toEqual([{ name: "lore", tokens: 200, pct: 20, },]);
  });

  test("empty input yields empty output", () => {
    expect(computeSections([], 1000,),).toEqual([],);
  });

  test("zero budget yields 0% shares instead of NaN", () => {
    const out = computeSections([{ name: "lore", tokens: 50, dropped: false, },], 0,);
    expect(out,).toEqual([{ name: "lore", tokens: 50, pct: 0, },]);
  });
});

describe("availableTokens", () => {
  test("reports the remainder", () => {
    expect(availableTokens(300, 1000,),).toBe(700,);
  });

  test("clamps overuse at zero, never negative", () => {
    expect(availableTokens(1500, 1000,),).toBe(0,);
    expect(availableTokens(1000, 1000,),).toBe(0,);
  });
});

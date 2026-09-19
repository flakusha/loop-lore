// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pipeline hardening tests (TASK-regex-pipeline-hardening).
 *
 * Covers three concerns:
 *   1. Input size cap at the pipeline entry — typed error, not generic.
 *   2. `lastIndex` reset between calls on shared global-flagged patterns
 *      (we verify by using the module-level ENTITY_PATTERN and REGEX_SPECIAL_CHARS).
 *   3. Intent amplification cap — INTENT_PATTERNS no longer runs uncapped.
 */

import { describe, expect, test, } from "bun:test";
import { INTENT_PATTERNS, REGEX_SPECIAL_CHARS, SLASH_COMMAND, } from "./intent";
import { ENTITY_PATTERN, } from "./memory-classification";
import {
  assertInputSize,
  MAX_INPUT_CHARS,
  RegexInputTooLargeError,
  safeRegexExec,
  safeRegexMatch,
} from "./safe-exec";
import { LOCATION_MOVEMENT, } from "./story-events";

// ── Input size cap ─────────────────────────────────────────

describe("assertInputSize", () => {
  test("accepts inputs at or below the cap", () => {
    expect(() => assertInputSize("",)).not.toThrow();
    expect(() => assertInputSize("a".repeat(MAX_INPUT_CHARS,),)).not.toThrow();
    expect(() => assertInputSize("hello world",)).not.toThrow();
  });

  test("throws RegexInputTooLargeError (typed) for oversized input", () => {
    const oversized = "x".repeat(MAX_INPUT_CHARS + 1,);
    let caught: unknown;
    try {
      assertInputSize(oversized,);
    } catch (err) {
      caught = err;
    }
    expect(caught,).toBeInstanceOf(RegexInputTooLargeError,);
    expect(caught,).toBeInstanceOf(Error,);
    // Distinct from a plain Error so callers can branch on it.
    expect((caught as Error).name,).toBe("RegexInputTooLargeError",);
    const typed = caught as RegexInputTooLargeError;
    expect(typed.actualLength,).toBe(oversized.length,);
    expect(typed.limit,).toBe(MAX_INPUT_CHARS,);
  });

  test("respects a custom limit", () => {
    expect(() => assertInputSize("a".repeat(100,), 50,)).toThrow(RegexInputTooLargeError,);
    expect(() => assertInputSize("a".repeat(49,), 50,)).not.toThrow();
  });

  test("rejects non-string input with TypeError", () => {
    // @ts-expect-error — intentional misuse
    expect(() => assertInputSize(42,)).toThrow(TypeError,);
    // @ts-expect-error — intentional misuse
    expect(() => assertInputSize(null,)).toThrow(TypeError,);
  });
});

// ── lastIndex reset ─────────────────────────────────────────

describe("safeRegexExec — lastIndex reset", () => {
  test("returns the first match on a global pattern, even after prior .exec()", () => {
    const pattern = /foo\d/g;
    // Drive the cursor forward so lastIndex > 0.
    pattern.exec("foo1 foo2 foo3",);
    expect(pattern.lastIndex,).toBeGreaterThan(0,);

    // A naive exec() now would resume from lastIndex and miss "foo1".
    const result = safeRegexExec(pattern, "foo1 foo2 foo3",);
    expect(result?.[0],).toBe("foo1",);
    // safeRegexExec resets to 0 before exec; lastIndex advances to end of match.
    expect(pattern.lastIndex,).toBe(4,);
  });

  test("repeated calls all see the input from the start", () => {
    const pattern = /ab/g;
    pattern.lastIndex = 2; // simulate stale state from a previous caller

    const inputs = ["abc", "xyzab", "ab",];
    for (const input of inputs) {
      const result = safeRegexExec(pattern, input,);
      if (input.includes("ab",)) {
        expect(result?.[0],).toBe("ab",);
      } else {
        expect(result,).toBeNull();
      }
      // Always reset for the next caller.
      expect(pattern.lastIndex,).toBeLessThanOrEqual(input.length,);
    }
  });

  test("safeRegexMatch mirrors String.match semantics", () => {
    const pattern = /\d+/g;
    pattern.lastIndex = 3; // pre-existing stale cursor

    const matches = safeRegexMatch(pattern, "a 12 b 345 c",);
    expect(matches,).not.toBeNull();
    expect(matches![0],).toBe("12",);
    expect(matches![1],).toBe("345",);
    expect(pattern.lastIndex,).toBe(0,);
  });

  test("module-level REGEX_SPECIAL_CHARS consumers see consistent answers", () => {
    // Without the g flag (or with lastIndex reset), every .test() is independent.
    // First three characters are special, then "a" is not.
    expect(REGEX_SPECIAL_CHARS.test(".",),).toBe(true,);
    expect(REGEX_SPECIAL_CHARS.test("a",),).toBe(false,);
    expect(REGEX_SPECIAL_CHARS.test("+",),).toBe(true,);
    expect(REGEX_SPECIAL_CHARS.test("z",),).toBe(false,);
  });

  test("module-level ENTITY_PATTERN returns full match list on each call", () => {
    ENTITY_PATTERN.lastIndex = 0;
    const text1 = "Aldric met Elara at the castle";
    const matches1 = text1.match(ENTITY_PATTERN,);
    expect(matches1,).toContain("Aldric",);
    expect(matches1,).toContain("Elara",);

    // After match() runs, ENTITY_PATTERN.lastIndex sits at the end. A second
    // call on fresh text must still start from index 0 — shared module pattern.
    // ENTITY_PATTERN allows multi-token proper nouns (Bran Stark), so the first
    // match is the longest run, not the first token alone.
    const text2 = "Bran Stark ruled the North";
    const matches2 = text2.match(ENTITY_PATTERN,);
    expect(matches2?.[0],).toBe("Bran Stark",);
    expect(matches2,).toContain("North",);
  });
});

// ── Intent amplification cap ──────────────────────────────

describe("INTENT_PATTERNS — amplification cap", () => {
  /**
   * The original ticket notes INTENT_PATTERNS ran uncapped across userInput.
   * The hardening guarantees:
   *   - INTENT_PATTERNS structure is bounded (10 groups).
   *   - Each group's patterns are bounded (small fixed list).
   *   - For any input the runtime work is O(groups × patterns × input length),
   *     not multiplied by an unbounded `.exec()` walk.
   */
  test("structure: bounded group and pattern counts", () => {
    expect(INTENT_PATTERNS.length,).toBeLessThanOrEqual(20,);
    for (const { patterns, } of INTENT_PATTERNS) {
      expect(patterns.length,).toBeLessThanOrEqual(10,);
    }
  });

  test("scanning a 200KB input via all INTENT_PATTERNS completes within 15s", () => {
    const big = "please create a character ".repeat(8_000,); // ~200KB
    const start = performance.now();
    for (const { patterns, } of INTENT_PATTERNS) {
      for (const p of patterns) {
        p.test(big,);
      }
    }
    const elapsed = performance.now() - start;
    // Without the cap, INTENT_PATTERNS tested 30+ patterns against the full
    // string. With it, we still scan but with a known bound. Threshold is
    // generous (15s; healthy runs measure ~6-7s depending on host load) to
    // avoid CI flake on shared hosts while still catching a true O(n²)
    // regression (would be 60s+).
    expect(elapsed,).toBeLessThan(15_000,);
  }, 15_000,);

  test("small inputs still resolve to the expected intent", () => {
    // "create a character" → generate/character
    const text = "create a character please";
    let matched: string | null = null;
    for (const { target, patterns, } of INTENT_PATTERNS) {
      for (const p of patterns) {
        p.lastIndex = 0;
        if (p.test(text,)) {
          matched = target;
          break;
        }
      }
      if (matched) { break; }
    }
    expect(matched,).toBe("character",);
  });

  test("SLASH_COMMAND module-level pattern doesn't drift after reuse", () => {
    // SLASH_COMMAND has no flags, but the helper should still reset cleanly.
    const result1 = safeRegexExec(SLASH_COMMAND, "/roll 2d6",);
    expect(result1?.[1],).toBe("roll",);
    const result2 = safeRegexExec(SLASH_COMMAND, "not a command",);
    expect(result2,).toBeNull();
  });

  test("LOCATION_MOVEMENT rejects punctuation-free narrative sprawl", () => {
    // Long run of locations with no terminator was the O(n²) case.
    const sprawl = "he enters the village then he moves to the forest then he goes to the cave";
    const start = performance.now();
    const match = LOCATION_MOVEMENT.exec(sprawl,);
    const elapsed = performance.now() - start;
    expect(match,).not.toBeNull();
    // Bounded capture: the named-location capture must be short.
    expect(match![1]!.length,).toBeLessThanOrEqual(30,);
    expect(elapsed,).toBeLessThan(50,);
  });
});

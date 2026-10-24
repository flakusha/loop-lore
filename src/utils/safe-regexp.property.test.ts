// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Property suite for the untrusted-pattern guard (fuzz-candidates #1).
 * Oracles are structural, never golden: never-throw, soundness (a returned
 * RegExp is one the native compiler accepts), the guard relation
 * (`hasSafeShape(p) === false` ⇒ `compileSafeRegExp(p) === null`), the
 * probe-proven catastrophic-shape rejections, and a wall-clock bound for
 * accepted patterns against a fixed adversarial subject.
 *
 * Resource contract: pure functions over in-memory strings — no I/O, no
 * shared state; the only timing is the local timing oracle below.
 */

import { describe, expect, test, } from "bun:test";
import fc from "fast-check";
import { compileSafeRegExp, hasSafeShape, } from "./safe-regexp";

const RUNS = { numRuns: 200, seed: 20261024, };

describe("compileSafeRegExp — properties", () => {
  test("never throws for arbitrary pattern strings", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 256, },), (p,) => {
        expect(() => compileSafeRegExp(p,)).not.toThrow();
      },),
      RUNS,
    );
  });

  test("sound: every returned RegExp is one the native compiler accepts", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 256, },),
        fc.constantFrom("", "i", "g", "m",),
        (p, flags,) => {
          const re = compileSafeRegExp(p, flags,);
          if (re === null) { return; }
          expect(() => new RegExp(p, flags,)).not.toThrow();
        },
      ),
      RUNS,
    );
  });

  test("guard relation: hasSafeShape false implies compile null", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 256, },), (p,) => {
        if (!hasSafeShape(p,)) {
          expect(compileSafeRegExp(p,),).toBeNull();
        }
      },),
      RUNS,
    );
  });

  test("probe-proven catastrophic shapes are rejected", () => {
    // Measured 2026-10-24 (redundancy-fuzz probes): guard-accepted `(a|aa)+c`
    // blew up 0.7ms → 231.7ms for subjects of length 22 → 34 (exponential);
    // `(a{2,3}){2,}` slipped past the old single-char quantifier check.
    // `(?:…)` and identical-branch variants pin that the check sees the real
    // branches, not group syntax or near-duplicates.
    const catastrophic = [
      "(a|aa)+c",
      "(a{2,3}){2,}",
      "(a+)+",
      "(a|)*",
      "(?:a|aa)+",
      "(x|x)+",
      "(http|https)+",
    ];

    for (const p of catastrophic) {
      expect(compileSafeRegExp(p,),).toBeNull();
    }
  });

  test("benign quantified shapes stay accepted", () => {
    // Non-overlapping alternations under a quantifier (`(cat|N/A)+`) must stay
    // accepted. `(\d{4}|N/A)+` is rejected by the PRE-EXISTING rule (a
    // quantified group whose body holds a quantifier — the inner `{4}`);
    // that predates the overlap check and is unchanged here.
    const benign = [
      "(ab)+",
      "(cat|N/A)+",
      "(\\d{4}|N/A)",
      "(cat|dog){2}",
      "(abc){2,3}",
      "(a){2}",
      "(a[b|c]d)+",
      "(a\\+)+",
    ];

    for (const p of benign) {
      expect(compileSafeRegExp(p,),).not.toBeNull();
    }
  });

  test("accepted patterns settle on a fixed adversarial subject under a generous wall bound", () => {
    const SUBJECT = "a".repeat(40,) + "b"; // classic `(a+)`-style failure fuel
    fc.assert(
      fc.property(fc.string({ maxLength: 64, },), (p,) => {
        const re = compileSafeRegExp(p,);
        if (re === null) { return; }
        const start = performance.now();
        re.test(SUBJECT,);
        expect(performance.now() - start,).toBeLessThan(250,);
      },),
      RUNS,
    );
  });
});

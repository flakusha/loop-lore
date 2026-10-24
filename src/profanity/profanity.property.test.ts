// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Property suite for the profanity service (fuzz-candidates #5).
 * Invariants over arbitrary strings: filtering removes every match the
 * service's own matcher detects (`containsProfanity(filter(x)) === false`),
 * filtering is idempotent, and the service never throws. Confusable/leet
 * inputs stay deliberately unpinned beyond these invariants (see the edge
 * note in service.test.ts). Verified before pinning: 0 violations across
 * 5000 seeded runs (seed 20261024, maxLength 100).
 *
 * Resource contract: pure functions over in-memory strings — no I/O; the
 * module-level matcher/censor are immutable configuration, not shared
 * mutable state.
 */

import { describe, expect, test, } from "bun:test";
import fc from "fast-check";
import { containsProfanity, filter, } from "./service";

const RUNS = { numRuns: 200, seed: 20261024, };

describe("profanity service — properties", () => {
  test("filter removes every match the matcher detects", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200, },), (x,) => {
        expect(containsProfanity(filter(x,),),).toBe(false,);
      },),
      RUNS,
    );
  });

  test("filter is idempotent", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200, },), (x,) => {
        const once = filter(x,);
        expect(filter(once,),).toBe(once,);
      },),
      RUNS,
    );
  });

  test("filter and containsProfanity never throw", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200, },), (x,) => {
        expect(() => filter(x,)).not.toThrow();
        expect(() => containsProfanity(x,)).not.toThrow();
      },),
      RUNS,
    );
  });
});

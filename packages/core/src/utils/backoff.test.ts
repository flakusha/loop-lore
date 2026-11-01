// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the shared exponential-backoff helper
 * (`src/utils/backoff.ts`): the doubling curve, the cap clamp, and the
 * 1-based attempt floor.
 */
import { describe, expect, test, } from "bun:test";
import { exponentialBackoffMs, } from "./backoff";

describe("exponentialBackoffMs", () => {
  test("doubles per attempt from the base", () => {
    expect(exponentialBackoffMs({ baseMs: 500, attempt: 1, },),).toBe(500,);
    expect(exponentialBackoffMs({ baseMs: 500, attempt: 2, },),).toBe(1000,);
    expect(exponentialBackoffMs({ baseMs: 500, attempt: 3, },),).toBe(2000,);
  });

  test("clamps to the cap when given", () => {
    expect(exponentialBackoffMs({ baseMs: 500, attempt: 10, capMs: 30000, },),).toBe(30000,);
    expect(exponentialBackoffMs({ baseMs: 500, attempt: 100, capMs: 30000, },),).toBe(30000,);
    expect(exponentialBackoffMs({ baseMs: 500, attempt: 7, capMs: 30000, },),).toBe(30000,);
  });

  test("grows unbounded without a cap", () => {
    expect(exponentialBackoffMs({ baseMs: 500, attempt: 10, },),).toBe(256000,);
  });

  test("sub-1 attempts clamp to the first attempt", () => {
    expect(exponentialBackoffMs({ baseMs: 500, attempt: 0, },),).toBe(500,);
    expect(exponentialBackoffMs({ baseMs: 500, attempt: -3, },),).toBe(500,);
  });

  test("zero base stays zero", () => {
    expect(exponentialBackoffMs({ baseMs: 0, attempt: 4, },),).toBe(0,);
  });
});

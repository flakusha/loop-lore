// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Pure algorithm boundary tests (epic-api-rate-limiting). */
import { describe, expect, test, } from "bun:test";
import { slidingWindow, tokenBucket, } from "./algorithms";

describe("slidingWindow", () => {
  test("allows under the cap and reports remaining", () => {
    const res = slidingWindow(1_000, [400, 600,], 1_000, 3,);
    expect(res.allowed,).toBe(true,);
    expect(res.remaining,).toBe(0,);
    expect(res.kept,).toHaveLength(3,);
  });

  test("prunes timestamps outside the window before deciding", () => {
    const res = slidingWindow(2_000, [500, 900, 1_500,], 1_000, 3,);
    expect(res.allowed,).toBe(true,);
    expect(res.kept,).toEqual([1_500, 2_000,],);
  });

  test("blocks at the cap with retryAfter to the oldest expiry", () => {
    const res = slidingWindow(1_000, [100, 400, 900,], 1_000, 3,);
    expect(res.allowed,).toBe(false,);
    expect(res.retryAfterSec,).toBe(1,);
    expect(res.kept,).toHaveLength(3,);
  });
});

describe("tokenBucket", () => {
  test("spends tokens and clamps refill at capacity", () => {
    const first = tokenBucket(1_000, { tokens: 5, lastRefillMs: 0, }, 5, 1, 2,);
    expect(first.allowed,).toBe(true,);
    expect(first.state.tokens,).toBe(3,);
    const refill = tokenBucket(10_000, first.state, 5, 1, 2,);
    expect(refill.state.tokens,).toBe(3,);
  });

  test("blocks when deficit exists and reports refill time", () => {
    const res = tokenBucket(1_000, { tokens: 0, lastRefillMs: 0, }, 5, 2, 3,);
    expect(res.allowed,).toBe(false,);
    expect(res.retryAfterSec,).toBeGreaterThanOrEqual(1,);
  });
});

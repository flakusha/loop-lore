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

  test("keeps a timestamp exactly at the cutoff — boundary aligned with the middleware limiter", () => {
    // Window 1_000 at now=2_000 → cutoff 1_000. A stamp exactly AT the
    // cutoff is still in-window (age == windowMs), so a full window of
    // boundary-aged stamps must still block; the slot frees only at
    // nowMs+1. The pre-fix predicate (`t > cutoff`) admitted a request
    // at exactly windowMs — one ms looser than src/middleware/rate-limit.ts.
    const boundary = slidingWindow(2_000, [1_000, 1_200, 1_400,], 1_000, 3,);
    expect(boundary.allowed,).toBe(false,);
    expect(boundary.kept,).toEqual([1_000, 1_200, 1_400,],);

    const freed = slidingWindow(2_001, [1_000, 1_200, 1_400,], 1_000, 3,);
    expect(freed.allowed,).toBe(true,);
    expect(freed.kept,).toEqual([1_200, 1_400, 2_001,],);
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

/**
 * Tests for the in-memory sliding-window rate limiter (src/middleware/rate-limit.ts).
 *
 * createRateLimiter is a pure in-memory factory; its only state is the Map of
 * buckets plus a prune interval. Time is driven deterministically with fake
 * timers (no real wall-clock waits), and destroy() stops the interval so no
 * timer leaks between tests.
 */
import { afterEach, beforeEach, describe, expect, test, vi, } from "bun:test";
import { createRateLimiter, } from "./rate-limit";

const cleanups: (() => void)[] = [];

function makeLimiter(windowMs: number, maxRequests: number,) {
  const limiter = createRateLimiter({ windowMs, maxRequests, },);
  cleanups.push(() => limiter.destroy());
  return limiter;
}

beforeEach(() => {
  vi.useFakeTimers();
},);

afterEach(() => {
  for (const cleanup of cleanups) { cleanup(); }
  cleanups.length = 0;
  vi.useRealTimers();
},);

describe("createRateLimiter", () => {
  test("allows requests up to the configured max within a window", () => {
    const limiter = makeLimiter(60_000, 3,);
    expect(limiter.check("ip-1",),).toBe(true,);
    expect(limiter.check("ip-1",),).toBe(true,);
    expect(limiter.check("ip-1",),).toBe(true,);
    // 4th within the same window exceeds the limit
    expect(limiter.check("ip-1",),).toBe(false,);
  });

  test("tracks different keys independently", () => {
    const limiter = makeLimiter(60_000, 2,);
    expect(limiter.check("a",),).toBe(true,);
    expect(limiter.check("a",),).toBe(true,);
    expect(limiter.check("a",),).toBe(false,);
    // A different key has its own budget
    expect(limiter.check("b",),).toBe(true,);
  });

  test("resets a single key's counter", () => {
    const limiter = makeLimiter(60_000, 1,);
    expect(limiter.check("k",),).toBe(true,);
    expect(limiter.check("k",),).toBe(false,);
    limiter.reset("k",);
    expect(limiter.check("k",),).toBe(true,);
  });

  test("resetting one key leaves other keys untouched", () => {
    const limiter = makeLimiter(60_000, 1,);
    limiter.check("x",);
    limiter.check("y",);
    limiter.reset("x",);
    expect(limiter.check("x",),).toBe(true,);
    expect(limiter.check("y",),).toBe(false,);
  });

  test("clears all buckets", () => {
    const limiter = makeLimiter(60_000, 1,);
    limiter.check("a",);
    limiter.check("b",);
    limiter.clear();
    expect(limiter.check("a",),).toBe(true,);
    expect(limiter.check("b",),).toBe(true,);
  });

  test("opens a new window after windowMs elapses", () => {
    const limiter = makeLimiter(1000, 1,);
    expect(limiter.check("k",),).toBe(true,);
    expect(limiter.check("k",),).toBe(false,);
    // Advance the fake clock past the window — a new request is allowed again
    vi.advanceTimersByTime(1001,);
    expect(limiter.check("k",),).toBe(true,);
  });

  test("does not reopen a window for a key before it expires", () => {
    const limiter = makeLimiter(1000, 1,);
    expect(limiter.check("k",),).toBe(true,);
    expect(limiter.check("k",),).toBe(false,);
    vi.advanceTimersByTime(500,);
    expect(limiter.check("k",),).toBe(false,);
  });

  test("prunes stale buckets for keys inactive past 2x the window", () => {
    const limiter = makeLimiter(1000, 5,);
    limiter.check("stale",);
    // Advance beyond 2x window so the prune interval fires and removes the bucket
    vi.advanceTimersByTime(2500,);
    // Key is treated as new (bucket pruned) — gets a fresh budget
    expect(limiter.check("stale",),).toBe(true,);
  });
});

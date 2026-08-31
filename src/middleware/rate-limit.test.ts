/**
 * Tests for the in-memory sliding-window rate limiter (src/middleware/rate-limit.ts).
 *
 * createRateLimiter is a pure in-memory factory; its only state is the Map of
 * per-key timestamp queues plus a prune interval. Time is driven deterministically
 * with fake timers (no real wall-clock waits), and destroy() stops the interval
 * so no timer leaks between tests.
 *
 * BUG-limiter-is-fixed-window-but-mislabeled-sliding-window: validates that the
 * limiter does NOT allow a 2x burst across window boundaries — a true sliding
 * window should never let a client exceed `maxRequests` within any `windowMs`
 * span, regardless of clock alignment.
 */
import { afterEach, beforeEach, describe, expect, test, vi, } from "bun:test";
import { createRateLimiter, rateLimitHeaders, } from "./rate-limit";

const cleanups: (() => void)[] = [];

/**
 * @param windowMs
 * @param maxRequests
 */
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
    // Advance beyond 2x window so the prune interval fires and removes the key
    vi.advanceTimersByTime(2500,);
    // Key is treated as new — gets a fresh budget
    expect(limiter.check("stale",),).toBe(true,);
  });

  // ── Sliding-window boundary regression (BUG-limiter-fixed-window) ────────

  test("sliding-window: no 2x burst across window boundary", () => {
    // BUG-limiter-fixed-window-but-mislabeled-sliding-window repro.
    // Attacker attempts 3 reqs at t=999 (end of window N) + 3 reqs at t=1001
    // (start of window N+1). The whole batch spans ~2ms. A fixed-window
    // limiter would allow 6 because the counter resets at the boundary; a
    // true sliding window must enforce a steady 3 per 1000ms — so the second
    // batch is refused until t=1999, when the first batch's timestamps age
    // out of the trailing window.
    const limiter = makeLimiter(1000, 3,);
    vi.advanceTimersByTime(999,); // start of test at t=999
    // 3 within window N at the end
    expect(limiter.check("burst",),).toBe(true,);
    expect(limiter.check("burst",),).toBe(true,);
    expect(limiter.check("burst",),).toBe(true,);
    expect(limiter.check("burst",),).toBe(false,);
    // t=1001 — just past the boundary
    vi.advanceTimersByTime(2,);
    // First 3 timestamps are at t=999..1001. Trailing window at t=1001 has
    // cutoff=t=1. None dropped yet → second batch must be blocked.
    expect(limiter.check("burst",),).toBe(false,);
    expect(limiter.check("burst",),).toBe(false,);
    expect(limiter.check("burst",),).toBe(false,);
  });

  test("sliding-window: slot frees up exactly when the oldest timestamp ages out", () => {
    // Use slightly-spaced timestamps so they age out one at a time.
    const limiter = makeLimiter(1000, 2,);
    // t=0: stamp1
    expect(limiter.check("k",),).toBe(true,);
    // t=100: stamp2 (oldest ages out at t=1000, newest at t=1100)
    vi.advanceTimersByTime(100,);
    expect(limiter.check("k",),).toBe(true,);
    expect(limiter.check("k",),).toBe(false,);
    // At t=999: oldest (t=0) expires at t=1000; still in window
    vi.advanceTimersByTime(899,);
    expect(limiter.check("k",),).toBe(false,);
    // At t=1001: oldest aged out → 1 slot free
    vi.advanceTimersByTime(2,);
    expect(limiter.check("k",),).toBe(true,);
    // Still only 1 slot (t=100 timestamp still in window)
    expect(limiter.check("k",),).toBe(false,);
    // At t=1101: second timestamp ages out → another slot free
    vi.advanceTimersByTime(100,);
    expect(limiter.check("k",),).toBe(true,);
  });
  test("sliding-window: 1 request per window stays under budget", () => {
    const limiter = makeLimiter(1000, 1,);
    expect(limiter.check("k",),).toBe(true,);
    // Within window
    expect(limiter.check("k",),).toBe(false,);
    // Just past window
    vi.advanceTimersByTime(1001,);
    expect(limiter.check("k",),).toBe(true,);
  });

  // ── consume() / headers (BUG-429-omit-headers) ───────────────────────────

  test("consume() returns allowed=true with remaining budget on success", () => {
    const limiter = makeLimiter(60_000, 3,);
    const r1 = limiter.consume("ip",);
    expect(r1.allowed,).toBe(true,);
    expect(r1.limit,).toBe(3,);
    expect(r1.remaining,).toBe(2,);
    expect(r1.resetSec,).toBeGreaterThan(0,);
  });

  test("consume() records on allowed and decrements remaining", () => {
    const limiter = makeLimiter(60_000, 3,);
    expect(limiter.consume("ip",).remaining,).toBe(2,);
    expect(limiter.consume("ip",).remaining,).toBe(1,);
    expect(limiter.consume("ip",).remaining,).toBe(0,);
    expect(limiter.consume("ip",).allowed,).toBe(false,);
  });

  test("consume() does NOT record on blocked request", () => {
    const limiter = makeLimiter(60_000, 2,);
    limiter.consume("ip",);
    limiter.consume("ip",);
    const blocked = limiter.consume("ip",);
    expect(blocked.allowed,).toBe(false,);
    expect(blocked.remaining,).toBe(0,);
    // Allowed next time should still be 2-budget fresh after window
    vi.advanceTimersByTime(60_001,);
    expect(limiter.consume("ip",).remaining,).toBe(1,);
  });

  test("consume() resetSec equals ms-until-oldest-ages-out (seconds, ceil)", () => {
    const limiter = makeLimiter(10_000, 1,);
    limiter.consume("ip",); // t=0
    vi.advanceTimersByTime(3000,); // now t=3000; oldest expires at t=10000; 7000ms = 7s
    const r = limiter.consume("ip",);
    expect(r.allowed,).toBe(false,);
    expect(r.resetSec,).toBe(7,);
  });

  test("rateLimitHeaders emits X-RateLimit-* on every result", () => {
    const limiter = makeLimiter(60_000, 5,);
    const result = limiter.consume("ip",);
    const headers = rateLimitHeaders(result,);
    expect(headers["X-RateLimit-Limit"],).toBe("5",);
    expect(headers["X-RateLimit-Remaining"],).toBe("4",);
    expect(headers["X-RateLimit-Reset"],).toBeDefined();
    expect(headers["Retry-After"],).toBeUndefined();
  });

  test("rateLimitHeaders omits Retry-After on allowed responses", () => {
    const limiter = makeLimiter(60_000, 5,);
    const allowed = limiter.consume("ip",);
    expect(allowed.allowed,).toBe(true,);
    const headers = rateLimitHeaders(allowed,);
    expect(headers["Retry-After"],).toBeUndefined();
  });

  test("rateLimitHeaders emits Retry-After when blocked (seconds, ceil)", () => {
    const limiter = makeLimiter(10_000, 1,);
    limiter.consume("ip",);
    vi.advanceTimersByTime(2500,);
    const blocked = limiter.consume("ip",);
    expect(blocked.allowed,).toBe(false,);
    // 7500ms remaining → ceil(7500/1000) = 8
    const headers = rateLimitHeaders(blocked, blocked.resetSec,);
    expect(headers["Retry-After"],).toBe("8",);
    expect(headers["X-RateLimit-Limit"],).toBe("1",);
    expect(headers["X-RateLimit-Remaining"],).toBe("0",);
  });

  test("rateLimitHeaders clamps Retry-After to >=1", () => {
    const result = {
      allowed: false,
      limit: 1,
      remaining: 0,
      resetSec: 1,
    };
    const headers = rateLimitHeaders(result, 0,);
    expect(headers["Retry-After"],).toBe("1",);
  });
});

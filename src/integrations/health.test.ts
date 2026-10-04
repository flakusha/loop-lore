// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for adapter health tracking and per-(adapter, target) rate limiting
 * (spec §4.4, §10). All clocks are injected — no real timers, no network.
 */
import { describe, expect, test, } from "bun:test";
import {
  type AdapterFailureCode,
  classifyAdapterFailure,
  createAdapterHealth,
  createAdapterRateLimiter,
} from "./health";

function makeClock(start = 1_000,): { now(): number; advance(ms: number,): void } {
  let ms = start;
  return {
    now: () => ms,
    advance: (delta,) => {
      ms += delta;
    },
  };
}

describe("AdapterHealth verdict transitions", () => {
  test("escalates ok → degraded → unhealthy across consecutive timeouts", () => {
    const clock = makeClock();
    const health = createAdapterHealth({ now: clock.now, },);

    health.markFailure("matrix", "timeout",);
    expect(health.get("matrix",)?.verdict,).toBe("degraded",);

    clock.advance(5_000,);
    health.markFailure("matrix", "timeout",);
    const entry = health.get("matrix",);
    expect(entry?.verdict,).toBe("unhealthy",);
    expect(entry?.reason,).toBeUndefined();
    expect(entry?.consecutiveFailures,).toBe(2,);
    expect(entry?.lastTransitionAt,).toBe(6_000,);
  });

  test("trips unhealthy immediately with a reason for auth/protocol/crash", () => {
    const health = createAdapterHealth();
    const cases: AdapterFailureCode[] = ["auth_expired", "protocol", "crash",];
    for (const code of cases) {
      health.markFailure("xmpp", code,);
      const entry = health.get("xmpp",);
      expect(entry?.verdict,).toBe("unhealthy",);
      expect(entry?.reason,).toBe(code,);
      health.reset();
    }
  });

  test("a successful send/receive recovers to ok and clears the streak", () => {
    const health = createAdapterHealth();
    health.markFailure("matrix", "timeout",);
    health.markFailure("matrix", "timeout",);
    expect(health.isHealthy("matrix",),).toBe(false,);

    health.markSuccess("matrix",);
    const entry = health.get("matrix",);
    expect(entry?.verdict,).toBe("ok",);
    expect(entry?.reason,).toBeUndefined();
    expect(entry?.consecutiveFailures,).toBe(0,);
    expect(health.isHealthy("matrix",),).toBe(true,);
  });

  test("isHealthy falls to the next auth rung when unhealthy (invariant 7)", () => {
    const health = createAdapterHealth();
    expect(health.isHealthy("unknown-adapter",),).toBe(true,);
    health.markFailure("signal", "auth_expired",);
    expect(health.isHealthy("signal",),).toBe(false,);
  });

  test("toSummary shapes the dashboard surface", () => {
    const health = createAdapterHealth({ now: () => 42, },);
    health.markFailure("irc", "crash",);
    expect(health.toSummary(),).toEqual([
      {
        name: "irc",
        verdict: "unhealthy",
        reason: "crash",
        lastTransitionAt: 42,
        consecutiveFailures: 1,
        healthy: false,
      },
    ],);
  });
});

describe("classifyAdapterFailure", () => {
  test("maps error shapes to §10 codes", () => {
    expect(classifyAdapterFailure(new Error("connect timeout after 5s",),),).toBe("timeout",);
    expect(classifyAdapterFailure(Object.assign(new Error("denied",), { code: "EACCES", },),),).toBe(
      "auth_expired",
    );

    expect(classifyAdapterFailure(new Error("HTTP 403 forbidden",),),).toBe("auth_expired",);
    expect(classifyAdapterFailure(new Error("malformed event envelope",),),).toBe("protocol",);
    expect(classifyAdapterFailure(new Error("segfault in native module",),),).toBe("crash",);
    expect(classifyAdapterFailure("not an error",),).toBe("crash",);
  });
});

describe("AdapterRateLimiter", () => {
  const RULE = { capacity: 2, refillMs: 1_000, };

  test("consumes tokens, blocks, then releases after refill", () => {
    const clock = makeClock();
    const limiter = createAdapterRateLimiter({ protocols: { matrix: RULE, }, now: clock.now, },);

    expect(limiter.consume("matrix", "matrix", "@room",),).toEqual({ ok: true, },);
    expect(limiter.consume("matrix", "matrix", "@room",),).toEqual({ ok: true, },);
    const limited = limiter.consume("matrix", "matrix", "@room",);
    expect(limited,).toEqual({ ok: false, code: "rate_limited", retryAfterMs: 1_000, },);

    clock.advance(1_000,);
    expect(limiter.consume("matrix", "matrix", "@room",),).toEqual({ ok: true, },);
  });

  test("buckets are independent per (adapter, target) pair", () => {
    const clock = makeClock();
    const limiter = createAdapterRateLimiter({ protocols: { matrix: RULE, }, now: clock.now, },);
    limiter.consume("matrix", "matrix", "@a",);
    limiter.consume("matrix", "matrix", "@a",);
    expect(limiter.consume("matrix", "matrix", "@a",).ok,).toBe(false,);
    expect(limiter.consume("matrix", "matrix", "@b",).ok,).toBe(true,);
    limiter.consume("matrix", "matrix", "@a",);
    expect(limiter.consume("other", "other", "@a",).ok,).toBe(true,);
  });

  test("a per-instance override beats the per-protocol default", () => {
    const clock = makeClock();
    const limiter = createAdapterRateLimiter({
      protocols: { matrix: RULE, },
      perAdapter: { matrix2: { capacity: 1, refillMs: 1_000, }, },
      now: clock.now,
    },);

    // matrix (protocol default): two tokens. matrix2 (override): one.
    expect(limiter.consume("matrix", "matrix", "@room",).ok,).toBe(true,);
    expect(limiter.consume("matrix", "matrix", "@room",).ok,).toBe(true,);
    expect(limiter.consume("matrix", "matrix", "@room",).ok,).toBe(false,);

    expect(limiter.consume("matrix2", "matrix2", "@room",).ok,).toBe(true,);
    expect(limiter.consume("matrix2", "matrix2", "@room",).ok,).toBe(false,);
  });

  test("observeRetryAfter honors an upstream 429 Retry-After", () => {
    const clock = makeClock();
    const limiter = createAdapterRateLimiter({ protocols: { matrix: RULE, }, now: clock.now, },);

    limiter.observeRetryAfter("matrix", "matrix", "@room", 7_500,);
    expect(limiter.consume("matrix", "matrix", "@room",),).toEqual(
      { ok: false, code: "rate_limited", retryAfterMs: 7_500, },
    );

    clock.advance(7_499,);
    expect(limiter.consume("matrix", "matrix", "@room",).ok,).toBe(false,);
    clock.advance(1,);
    expect(limiter.consume("matrix", "matrix", "@room",).ok,).toBe(true,);
  });

  test("protocols without a rule are unlimited", () => {
    const limiter = createAdapterRateLimiter({ protocols: { matrix: RULE, }, },);
    for (let i = 0; i < 10; i++) {
      expect(limiter.consume("irc", "irc", "#chan",).ok,).toBe(true,);
    }
  });
});

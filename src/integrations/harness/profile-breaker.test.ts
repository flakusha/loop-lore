// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ProfileBreaker tests. Clock injected — cooldowns advance without sleeps.
 * Each test builds its own breaker instance (parallel-safe by construction).
 */
import { describe, expect, it, } from "bun:test";
import { type HealthClock, ProfileBreaker, } from "./profile-breaker";

/** Mutable fake clock. */
function fakeClock(): { now: () => number; advance: (ms: number,) => void } {
  let t = 2_000_000;
  const clock: HealthClock = () => t;
  return {
    now: clock,
    advance: (ms: number,) => {
      t += ms;
    },
  };
}

/** Breaker with threshold 2 and 5s cooldown. */
function smallBreaker(clock: () => number,): ProfileBreaker {
  return new ProfileBreaker(() => ({ maxConsecutiveFailures: 2, cooldownMs: 5_000, }), clock,);
}

describe("ProfileBreaker", () => {
  it("stays closed while failures stay under the threshold", () => {
    const { now, } = fakeClock();
    const breaker = smallBreaker(now,);
    breaker.onFailure("p",);
    expect(breaker.allow("p",),).toBe(true,);
  });

  it("opens at the threshold and blocks the profile", () => {
    const { now, } = fakeClock();
    const breaker = smallBreaker(now,);
    breaker.onFailure("p",);
    breaker.onFailure("p",);
    expect(breaker.allow("p",),).toBe(false,);
    expect(breaker.cooldownRemainingMs("p",),).toBe(5_000,);
  });

  it("re-opens after cooldown elapses (injected clock, no sleep)", () => {
    const { now, advance, } = fakeClock();
    const breaker = smallBreaker(now,);
    breaker.onFailure("p",);
    breaker.onFailure("p",);
    advance(4_999,);
    expect(breaker.allow("p",),).toBe(false,);
    advance(1,);
    expect(breaker.allow("p",),).toBe(true,);
  });

  it("success resets the failure count", () => {
    const { now, } = fakeClock();
    const breaker = smallBreaker(now,);
    breaker.onFailure("p",);
    breaker.onSuccess("p",);
    breaker.onFailure("p",);
    expect(breaker.allow("p",),).toBe(true,);
  });

  it("profiles are isolated (instance-owned state)", () => {
    const { now, } = fakeClock();
    const breaker = smallBreaker(now,);
    breaker.onFailure("a",);
    breaker.onFailure("a",);
    expect(breaker.allow("a",),).toBe(false,);
    expect(breaker.allow("b",),).toBe(true,);
  });

  it("resolves thresholds per profile from config", () => {
    const { now, } = fakeClock();
    const breaker = new ProfileBreaker(
      (profile,) => ({ maxConsecutiveFailures: profile === "strict" ? 1 : 99, cooldownMs: 1_000, }),
      now,
    );

    breaker.onFailure("strict",);
    expect(breaker.allow("strict",),).toBe(false,);
  });
});

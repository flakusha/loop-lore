// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Limiter integration tests: steady window + burst bucket + peek. */
import { describe, expect, test, } from "bun:test";
import { GovernanceRateLimiter, } from "./limiter";
import { generationPolicy, } from "./policies";

describe("GovernanceRateLimiter", () => {
  test("allows steady traffic under the window cap", () => {
    const limiter = new GovernanceRateLimiter({ now: () => 1_000, },);
    for (let i = 0; i < 5; i++) {
      expect(limiter.consume("u1", generationPolicy,).allowed,).toBe(true,);
    }
    limiter.destroy();
  });

  test("burst exhaustion blocks before the window cap does", () => {
    let t = 1_000;
    const limiter = new GovernanceRateLimiter({ now: () => t, },);
    // burst=5 tokens, refill 20/60s → tiny refill per call. Spend 5 fast.
    for (let i = 0; i < 5; i++) {
      expect(limiter.consume("u2", generationPolicy,).allowed,).toBe(true,);
    }
    const blocked = limiter.consume("u2", generationPolicy,);
    expect(blocked.allowed,).toBe(false,);
    expect(blocked.retryAfterSec,).toBeGreaterThan(0,);
    limiter.destroy();
  });

  test("window frees after windowMs elapses (injected clock)", () => {
    let t = 1_000;
    const limiter = new GovernanceRateLimiter({ now: () => t, },);
    const policy = { name: "tiny", windowMs: 1_000, max: 2, };
    expect(limiter.consume("u3", policy,).allowed,).toBe(true,);
    expect(limiter.consume("u3", policy,).allowed,).toBe(true,);
    expect(limiter.consume("u3", policy,).allowed,).toBe(false,);
    t += 1_001;
    expect(limiter.consume("u3", policy,).allowed,).toBe(true,);
    limiter.destroy();
  });

  test("peek reports remaining without consuming", () => {
    let t = 1_000;
    const limiter = new GovernanceRateLimiter({ now: () => t, },);
    const policy = { name: "tiny", windowMs: 1_000, max: 2, };
    limiter.consume("u4", policy,);
    expect(limiter.peek("u4", policy,).remaining,).toBe(1,);
    expect(limiter.peek("u4", policy,).remaining,).toBe(1,);
    limiter.consume("u4", policy,);
    expect(limiter.peek("u4", policy,).remaining,).toBe(0,);
    limiter.destroy();
  });
});

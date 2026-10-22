// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression: generation flow regulation (rate limit + concurrency caps).
 *
 * `gateRateLimit`: within budget passes; exhaustion refuses with 429
 * headers (Retry-After + X-RateLimit-*); a non-positive budget disables.
 * `gateConcurrency`: zero caps pass; a full global house refuses; a full
 * chat house refuses while other chats pass. Counts come from the live
 * tracker maps — the test seeds `activeGenerations` + `chatToAttempt`
 * directly and clears them after (same idiom as cancel.test.ts).
 * `resolveFlowPolicy`: config overrides defaults per-field.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import { createRateLimiter, } from "../middleware/rate-limit";
import { activeGenerations, chatToAttempt, } from "./cancellation-tracker/state";
import {
  createGenerationLimiter,
  FLOW_CONTROL_DEFAULTS,
  type FlowControlPolicy,
  gateConcurrency,
  gateRateLimit,
  resolveFlowPolicy,
} from "./flow-control";

const POLICY: FlowControlPolicy = {
  rateLimitPerUser: 2,
  rateLimitWindowMs: 60_000,
  maxConcurrentGlobal: 1,
  maxConcurrentPerChat: 1,
};

afterEach(() => {
  activeGenerations.clear();
  chatToAttempt.clear();
},);

/** Minimal ActiveGeneration entry carrying the fields the gates read. */
function seedActive(chatId: string, attemptId: string,): void {
  activeGenerations.set(attemptId, { chatId, attemptId, } as never,);
  chatToAttempt.set(chatId, attemptId,);
}

describe("gateRateLimit", () => {
  test("passes within budget", () => {
    const limiter = createGenerationLimiter(POLICY,);
    try {
      expect(gateRateLimit("u1", POLICY, limiter,),).toBeNull();
      expect(gateRateLimit("u1", POLICY, limiter,),).toBeNull();
    } finally {
      limiter.destroy();
    }
  });

  test("refuses with 429 headers past budget", () => {
    const limiter = createGenerationLimiter(POLICY,);
    try {
      gateRateLimit("u1", POLICY, limiter,);
      gateRateLimit("u1", POLICY, limiter,);
      const blocked = gateRateLimit("u1", POLICY, limiter,);
      expect(blocked,).not.toBeNull();
      expect(blocked!.headers["Retry-After"],).toBeDefined();
      expect(blocked!.headers["X-RateLimit-Limit"],).toBe("2",);
      expect(blocked!.headers["X-RateLimit-Remaining"],).toBe("0",);
    } finally {
      limiter.destroy();
    }
  });

  test("a zero budget disables the gate", () => {
    const open: FlowControlPolicy = { ...POLICY, rateLimitPerUser: 0, };
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 2, },);
    try {
      for (let i = 0; i < 5; i += 1) {
        expect(gateRateLimit("u1", open, limiter,),).toBeNull();
      }
    } finally {
      limiter.destroy();
    }
  });
});

describe("gateConcurrency", () => {
  test("passes when nothing is tracked", () => {
    expect(gateConcurrency("chat-a", POLICY,),).toBeNull();
  });

  test("zero caps pass regardless of tracked load", () => {
    seedActive("chat-a", "attempt-1",);
    const open: FlowControlPolicy = { ...POLICY, maxConcurrentGlobal: 0, maxConcurrentPerChat: 0, };
    expect(gateConcurrency("chat-a", open,),).toBeNull();
  });

  test("a full global house refuses every chat", () => {
    seedActive("chat-a", "attempt-1",);
    expect(gateConcurrency("chat-a", POLICY,),).toBe("global",);
    expect(gateConcurrency("chat-b", POLICY,),).toBe("global",);
  });

  test("a full chat house refuses that chat but not others", () => {
    seedActive("chat-a", "attempt-1",);
    const perChat: FlowControlPolicy = { ...POLICY, maxConcurrentGlobal: 0, };
    expect(gateConcurrency("chat-a", perChat,),).toBe("chat",);
    expect(gateConcurrency("chat-b", perChat,),).toBeNull();
  });
});

describe("resolveFlowPolicy", () => {
  test("config overrides defaults per-field", () => {
    const policy = resolveFlowPolicy({
      generation: { flowControl: { rateLimitPerUser: 5, }, },
    } as never,);

    expect(policy.rateLimitPerUser,).toBe(5,);
    expect(policy.rateLimitWindowMs,).toBe(FLOW_CONTROL_DEFAULTS.rateLimitWindowMs,);
  });

  test("missing config reads defaults", () => {
    expect(resolveFlowPolicy(undefined,),).toEqual(FLOW_CONTROL_DEFAULTS,);
  });
});

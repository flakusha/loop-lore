// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Generation flow regulation: per-user rate limiting + concurrency caps.
 *
 * Reject-fast (429/409), never queue — the UI renders a disabled state
 * instead of a spinner. Rechecked at the route gate (user-visible 429)
 * and at slot claim would race; the claim-time check in
 * `validateGenerateRequest` runs BEFORE `hasInFlightGeneration` so a
 * regulated request creates no attempt row and no in-memory entry.
 *
 * Single-process in-memory state, same invariant as the auth limiters —
 * see routes/auth/shared.ts. Concurrency counts come from the existing
 * cancellation-tracker maps (no parallel bookkeeping to drift).
 */
import type { Config, } from "../config/schema";
import { createRateLimiter, type RateLimiter, rateLimitHeaders, } from "../middleware/rate-limit";
import { activeGenerations, chatToAttempt, } from "./cancellation-tracker/state";

/** Resolved regulation policy for one gate evaluation. */
export interface FlowControlPolicy {
  rateLimitPerUser: number;
  rateLimitWindowMs: number;
  maxConcurrentGlobal: number;
  maxConcurrentPerChat: number;
}

/** Defaults mirror GENERATION_FLOW_CONTROL_DEFAULTS (config may override). */
export const FLOW_CONTROL_DEFAULTS: FlowControlPolicy = {
  rateLimitPerUser: 30,
  rateLimitWindowMs: 60_000,
  maxConcurrentGlobal: 0,
  maxConcurrentPerChat: 0,
};

/**
 * Resolve the active policy: config `generation.flowControl` over defaults.
 * Zero/negative reads as unbounded (matches the documented 0 = no limit).
 * @param config
 * @returns the effective policy
 */
export function resolveFlowPolicy(config?: Config,): FlowControlPolicy {
  const fc = config?.generation?.flowControl;
  return {
    rateLimitPerUser: fc?.rateLimitPerUser ?? FLOW_CONTROL_DEFAULTS.rateLimitPerUser,
    rateLimitWindowMs: fc?.rateLimitWindowMs ?? FLOW_CONTROL_DEFAULTS.rateLimitWindowMs,
    maxConcurrentGlobal: fc?.maxConcurrentGlobal ?? FLOW_CONTROL_DEFAULTS.maxConcurrentGlobal,
    maxConcurrentPerChat: fc?.maxConcurrentPerChat ?? FLOW_CONTROL_DEFAULTS.maxConcurrentPerChat,
  };
}

// Module singleton is the production default; tests inject their own
// instance so parallel files never share mutable limiter state.
let limiter: RateLimiter = createRateLimiter({
  windowMs: FLOW_CONTROL_DEFAULTS.rateLimitWindowMs,
  maxRequests: FLOW_CONTROL_DEFAULTS.rateLimitPerUser,
},);

let limiterPolicy = { ...FLOW_CONTROL_DEFAULTS, };

/**
 * Build an isolated generation limiter (same policy as the production default).
 * Tests call this per-file so resets never cross file boundaries.
 * @param policy
 * @returns a fresh limiter
 */
export function createGenerationLimiter(policy: FlowControlPolicy = FLOW_CONTROL_DEFAULTS,): RateLimiter {
  return createRateLimiter({ windowMs: policy.rateLimitWindowMs, maxRequests: policy.rateLimitPerUser, },);
}

/** Reset the module singleton (tests + config-reload paths). */
export function resetGenerationLimiter(): void {
  limiter.clear();
}

/**
 * Per-user sliding-window gate. No policy configured (limit <= 0) passes.
 * The limiter singleton is rebuilt when the active policy's budget changes
 * so a config flip takes effect without restart.
 * @param userId
 * @param policy
 * @param limiterOverride - injected instance (tests)
 * @returns null when within budget, else headers for the 429 response
 */
export function gateRateLimit(
  userId: string,
  policy: FlowControlPolicy,
  limiterOverride?: RateLimiter,
): { headers: Record<string, string> } | null {
  if (policy.rateLimitPerUser <= 0) { return null; }
  const active = limiterOverride ?? ensureLimiter(policy,);
  const result = active.consume(userId,);
  if (result.allowed) { return null; }
  return { headers: rateLimitHeaders(result, result.resetSec,), };
}

/** Rebuild the singleton when the budget changed; else reuse. */
function ensureLimiter(policy: FlowControlPolicy,): RateLimiter {
  if (
    limiterPolicy.rateLimitPerUser !== policy.rateLimitPerUser ||
    limiterPolicy.rateLimitWindowMs !== policy.rateLimitWindowMs
  ) {
    limiter.destroy();
    limiter = createRateLimiter({ windowMs: policy.rateLimitWindowMs, maxRequests: policy.rateLimitPerUser, },);
    limiterPolicy = { ...policy, };
  }

  return limiter;
}

/**
 * Concurrency gate off the live tracker maps. Zero/negative caps pass;
 * otherwise a full house refuses with the contended scope for the message.
 * @param chatId
 * @param policy
 * @returns null when a slot is free, else the contended scope
 */
export function gateConcurrency(chatId: string, policy: FlowControlPolicy,): "global" | "chat" | null {
  if (policy.maxConcurrentGlobal > 0 && activeGenerations.size >= policy.maxConcurrentGlobal) {
    return "global";
  }

  if (policy.maxConcurrentPerChat <= 0) { return null; }
  let inChat = 0;
  for (const attemptId of chatToAttempt.values()) {
    if (activeGenerations.has(attemptId,)) {
      const entry = activeGenerations.get(attemptId,);
      if (entry?.chatId === chatId) { inChat += 1; }
    }
  }

  return inChat >= policy.maxConcurrentPerChat ? "chat" : null;
}

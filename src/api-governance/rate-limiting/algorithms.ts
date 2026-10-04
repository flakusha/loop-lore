// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Rate-limiting algorithms (epic-api-rate-limiting).
 *
 * Pure decision functions over caller-owned state — no I/O, no clock reads
 * (time is injected) so boundary behaviour is unit-testable. The limiter
 * applies the decisions to a RateLimitStore.
 */

/** */
export interface SlidingWindowDecision {
  allowed: boolean;
  /** Requests left in the current window after this decision. */
  remaining: number;
  /** Seconds until the oldest in-window request expires (0 when allowed). */
  retryAfterSec: number;
}

/** */
export interface TokenBucketState {
  tokens: number;
  lastRefillMs: number;
}

/** */
export interface TokenBucketDecision {
  allowed: boolean;
  state: TokenBucketState;
  retryAfterSec: number;
}

/**
 * Sliding-window steady-state check. Caller persists `kept` on allow.
 * @param nowMs
 * @param timestamps In-window request times (ms epoch), oldest first.
 * @param windowMs
 * @param max
 * @returns {SlidingWindowDecision & { kept: number[]; }}
 */
export function slidingWindow(
  nowMs: number,
  timestamps: number[],
  windowMs: number,
  max: number,
): SlidingWindowDecision & { kept: number[] } {
  const fresh = timestamps.filter((t,) => t > nowMs - windowMs);
  if (fresh.length < max) {
    fresh.push(nowMs,);
    return { allowed: true, remaining: max - fresh.length, retryAfterSec: 0, kept: fresh, };
  }

  const oldest = fresh[0]!;
  return {
    allowed: false,
    remaining: 0,
    retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - nowMs) / 1000,),),
    kept: fresh,
  };
}

/**
 * Token-bucket burst check layered on top of steady-state windows.
 * Refill is continuous (tokens accrue per ms). Caller persists `state`.
 * @param nowMs
 * @param state
 * @param capacity
 * @param refillPerSec
 * @param cost
 * @returns {TokenBucketDecision}
 */
export function tokenBucket(
  nowMs: number,
  state: TokenBucketState,
  capacity: number,
  refillPerSec: number,
  cost: number,
): TokenBucketDecision {
  const elapsedSec = Math.max(0, (nowMs - state.lastRefillMs) / 1000,);
  const tokens = Math.min(capacity, state.tokens + elapsedSec * refillPerSec,);
  if (tokens >= cost) {
    return { allowed: true, state: { tokens: tokens - cost, lastRefillMs: nowMs, }, retryAfterSec: 0, };
  }

  const deficit = cost - tokens;
  return {
    allowed: false,
    state: { tokens, lastRefillMs: nowMs, },
    retryAfterSec: Math.max(1, Math.ceil(deficit / refillPerSec,),),
  };
}

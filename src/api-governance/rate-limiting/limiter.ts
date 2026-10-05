// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Governance rate limiter (epic-api-rate-limiting): steady sliding window
 * with optional token-bucket burst per policy. Keys are caller-composed
 * (typically `userId` or `ip` — per-user and per-IP limits are two limiter
 * instances over the same store).
 */
import { slidingWindow, tokenBucket, type TokenBucketState, } from "./algorithms";
import { type RatePolicy, } from "./policies";
import { InMemoryRateLimitStore, type RateLimitStore, } from "./store";

/** Rate limit verdict returned by consume(). */
export interface RateLimitVerdict {
  allowed: boolean;
  policy: string;
  limit: number;
  remaining: number;
  /** Seconds until the window frees up (present when blocked). */
  retryAfterSec?: number;
}

/** Governance rate limiter with sliding window + optional token bucket. */
export class GovernanceRateLimiter {
  private store: RateLimitStore;
  private now: () => number;

  /**
   * Create a new rate limiter with optional store and clock.
   * @param opts
   * @param opts.store
   * @param opts.now
   */
  constructor(opts: {
    store?: RateLimitStore;
    /** Injectable clock (ms epoch) — defaults to Date.now. */
    now?: () => number;
  } = {},) {
    this.store = opts.store ?? new InMemoryRateLimitStore();
    this.now = opts.now ?? (() => Date.now());
  }

  /** Read-only view for the status endpoint — consumes nothing. */
  /**
   * @param {string} key
   * @param {RatePolicy} policy
   * @returns {{ policy: string; limit: number; remaining: number; }}
   */
  peek(key: string, policy: RatePolicy,): { policy: string; limit: number; remaining: number } {
    const nowMs = this.now();
    const fresh = this.store.loadWindow(key, nowMs,).filter((t,) => t > nowMs - policy.windowMs);
    return { policy: policy.name, limit: policy.max, remaining: Math.max(0, policy.max - fresh.length,), };
  }

  /** Consume cost units against the key's policy. Returns verdict. */
  /**
   * @param {string} key
   * @param {RatePolicy} policy
   * @param {unknown} cost
   * @returns {RateLimitVerdict}
   */
  consume(key: string, policy: RatePolicy, cost = 1,): RateLimitVerdict {
    const nowMs = this.now();
    const win = slidingWindow(nowMs, this.store.loadWindow(key, nowMs,), policy.windowMs, policy.max,);
    this.store.saveWindow(key, win.kept, policy.windowMs, nowMs,);
    if (!win.allowed) {
      return {
        allowed: false,
        policy: policy.name,
        limit: policy.max,
        remaining: 0,
        retryAfterSec: win.retryAfterSec,
      };
    }

    if (policy.burst) {
      const refillPerSec = policy.max / (policy.windowMs / 1000);
      const existing = this.store.loadBucket(key,);
      const state: TokenBucketState = existing ?? { tokens: policy.burst, lastRefillMs: nowMs, };
      const bucket = tokenBucket(nowMs, state, policy.burst, refillPerSec, cost,);
      this.store.saveBucket(key, bucket.state, policy.windowMs, nowMs,);
      if (!bucket.allowed) {
        return {
          allowed: false,
          policy: policy.name,
          limit: policy.max,
          remaining: 0,
          retryAfterSec: bucket.retryAfterSec,
        };
      }
    }

    return { allowed: true, policy: policy.name, limit: policy.max, remaining: win.remaining, };
  }

  /** Stop timers and release resources. */
  /**
   * @returns {void}
   */
  destroy(): void {
    this.store.destroy();
  }
}

/** Limiter options — derived from the class ctor (single source). */
export type GovernanceRateLimiterOpts = NonNullable<ConstructorParameters<typeof GovernanceRateLimiter>[0]>;

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { slidingWindow, tokenBucket, type TokenBucketState, } from "./algorithms";
import { type RatePolicy, } from "./policies";
import { InMemoryRateLimitStore, type RateLimitStore, } from "./store";

export interface RateLimitVerdict {
  allowed: boolean;
  policy: string;
  limit: number;
  remaining: number;
  retryAfterSec?: number;
}

export class GovernanceRateLimiter {
  private store: RateLimitStore;
  private now: () => number;

  /**
   * Create a new rate limiter with optional store and clock.
   * @param opts
   */
  constructor(opts: { store?: RateLimitStore; now?: () => number } = {},) {
    this.store = opts.store ?? new InMemoryRateLimitStore();
    this.now = opts.now ?? (() => Date.now());
  }

  /** Read-only view for the status endpoint — consumes nothing. */
  /**
   * @param key
   * @param policy
   */
  peek(key: string, policy: RatePolicy,): { policy: string; limit: number; remaining: number } {
    const nowMs = this.now();
    const fresh = this.store.loadWindow(key, nowMs,).filter((t,) => t > nowMs - policy.windowMs);
    return { policy: policy.name, limit: policy.max, remaining: Math.max(0, policy.max - fresh.length,), };
  }

  /** Consume cost units against the key's policy. Returns verdict. */
  /**
   * @param key
   * @param policy
   * @param cost
   */
  consume(key: string, policy: RatePolicy, cost = 1,): RateLimitVerdict {
    const nowMs = this.now();
    const win = slidingWindow(nowMs, this.store.loadWindow(key, nowMs,), policy.windowMs, policy.max,);
    if (!win.allowed) {
      this.store.saveWindow(key, win.kept, policy.windowMs, nowMs,);
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
        // Burst denied: drop the just-pushed timestamp from the window so
        // the rejected request does not erode steady-state budget.
        this.store.saveWindow(key, win.kept.slice(0, -1,), policy.windowMs, nowMs,);
        return {
          allowed: false,
          policy: policy.name,
          limit: policy.max,
          remaining: 0,
          retryAfterSec: bucket.retryAfterSec,
        };
      }
    }

    this.store.saveWindow(key, win.kept, policy.windowMs, nowMs,);
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

export type GovernanceRateLimiterOpts = NonNullable<ConstructorParameters<typeof GovernanceRateLimiter>[0]>;

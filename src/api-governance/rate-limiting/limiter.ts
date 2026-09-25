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

/** */
export interface RateLimitVerdict {
  allowed: boolean;
  policy: string;
  limit: number;
  remaining: number;
  /** Seconds until the window frees up (present when blocked). */
  retryAfterSec?: number;
}

/** */
export interface GovernanceRateLimiterOpts {
  store?: RateLimitStore;
  /** Injectable clock (ms epoch) — defaults to Date.now. */
  now?: () => number;
}

/** */
export class GovernanceRateLimiter {
  private store: RateLimitStore;
  private now: () => number;

  /** */
  constructor(opts: GovernanceRateLimiterOpts = {},) {
    this.store = opts.store ?? new InMemoryRateLimitStore();
    this.now = opts.now ?? (() => Date.now());
  }

  /** Read-only view for the status endpoint — consumes nothing. */
  peek(key: string, policy: RatePolicy,): { policy: string; limit: number; remaining: number } {
    const nowMs = this.now();
    const fresh = this.store.loadWindow(key,).filter((t,) => t > nowMs - policy.windowMs);
    return { policy: policy.name, limit: policy.max, remaining: Math.max(0, policy.max - fresh.length,), };
  }

  /** */
  consume(key: string, policy: RatePolicy, cost = 1,): RateLimitVerdict {
    const nowMs = this.now();
    const win = slidingWindow(nowMs, this.store.loadWindow(key,), policy.windowMs, policy.max,);
    this.store.saveWindow(key, win.kept,);
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
      this.store.saveBucket(key, bucket.state,);
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

  /** */
  destroy(): void {
    this.store.destroy();
  }
}

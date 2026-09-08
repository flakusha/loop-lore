// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Rate Limiting Middleware
 *
 * In-memory sliding-window rate limiter per key. Uses a per-key queue of
 * request timestamps; a request is allowed iff fewer than `maxRequests`
 * timestamps fall within the trailing `windowMs`.
 *
 * Lifecycle & multi-instance: each `createRateLimiter()` call produces an independent limiter with its own Map. In a single-process server (the current deployment), one limiter instance is shared application-wide via module-level singletons (createLoginLimiter etc.). Call `destroy()` on server shutdown to stop pruning and clear state. In multi-process or test contexts each process/test must create its own limiter via the factory.
 *
 * Why a timestamp queue (not the previous counter-and-window-start):
 * a counter reset at window boundaries lets a client spend the full budget
 * at the end of one window and again at the start of the next — a 2x burst
 * across the boundary. Sliding-window counts requests in the trailing
 * window, so the worst case is one budget of `maxRequests` per `windowMs`
 * regardless of alignment.
 *
 * Usage:
 *   const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 100 });
 *   const result = limiter.consume(clientIp);
 *   if (!result.allowed) {
 *     return new Response(null, { status: 429, headers: rateLimitHeaders(result) });
 *   }
 */

/** Outcome of a single consume() call. */
export interface RateLimitResult {
  /** True iff the request is within budget. */
  allowed: boolean;
  /** Configured maximum requests per window. */
  limit: number;
  /** Remaining requests in the current window after this call. */
  remaining: number;
  /**
   * Whole seconds until the oldest timestamp in the window expires.
   * Always > 0 when blocked; equals `windowMs / 1000` on the first request.
   */
  resetSec: number;
}

/**
 * Build the headers for a 429 (or informational) response.
 * @param result
 * @param retryAfterSec
 */
export function rateLimitHeaders(
  result: RateLimitResult,
  retryAfterSec?: number,
): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(result.limit,),
    "X-RateLimit-Remaining": String(Math.max(0, result.remaining,),),
    "X-RateLimit-Reset": String(result.resetSec,),
  };
  if (!result.allowed && retryAfterSec !== undefined) {
    headers["Retry-After"] = String(Math.max(1, Math.ceil(retryAfterSec,),),);
  }
  return headers;
}

/** */
export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

/**
 * Build an in-memory sliding-window rate limiter.
 *
 * Scope assumptions (BUG-in-memory-limiter-not-shared-across-instances):
 * buckets live in this closure's Map, so limits are per-process — behind a
 * load balancer or multiple workers the effective per-client limit is N× the
 * configured value and restarts reset all buckets. Single-instance solo
 * deployments (this app's target) are unaffected; scaled deployments must
 * back the limiter with a shared store. The prune timer keeps running for
 * the process lifetime; call {@link destroy} on the returned instance to
 * stop it (tests, per-request instantiation, shutdown hooks).
 * @param config
 */
export function createRateLimiter(config: RateLimitConfig,) {
  // Per-key queue of timestamps (ms). The queue length is bounded by
  // maxRequests for any key in normal operation.
  const timestamps = new Map<string, number[]>();

  // Prune keys whose queues are empty (key has been idle past the window).
  const pruneInterval = setInterval(() => {
    const cutoff = Date.now() - config.windowMs;
    for (const [key, queue,] of timestamps) {
      // Drop expired entries; if the queue empties, drop the key entirely.
      while (queue.length > 0 && queue[0]! < cutoff) { queue.shift(); }
      if (queue.length === 0) { timestamps.delete(key,); }
    }
  }, config.windowMs,);

  /**
   * Record a request and report whether it is within budget.
   * `consume()` is the single source of truth: it both checks and records.
   * Callers that need the pre-recording shape should branch on `allowed`.
   * @param key
   * @param now
   */
  function consume(key: string, now = Date.now(),): RateLimitResult {
    const cutoff = now - config.windowMs;
    let queue = timestamps.get(key,);
    if (!queue) {
      queue = [];
      timestamps.set(key, queue,);
    }
    // Drop timestamps that fell out of the window.
    while (queue.length > 0 && queue[0]! <= cutoff) { queue.shift(); }

    if (queue.length >= config.maxRequests) {
      // Blocked: do NOT add a timestamp. Retry-After = ms until the
      // oldest in-window timestamp ages out, in seconds (rounded up).
      const oldest = queue[0]!;
      const resetMs = oldest + config.windowMs - now;
      return {
        allowed: false,
        limit: config.maxRequests,
        remaining: 0,
        resetSec: Math.max(1, Math.ceil(resetMs / 1000,),),
      };
    }

    queue.push(now,);
    // remaining is post-recording (this request just consumed one slot)
    const remaining = config.maxRequests - queue.length;
    // For an allowed request, "reset" is when the oldest in-window timestamp
    // expires — i.e. when remaining will next increment.
    const oldest = queue[0]!;
    const resetMs = oldest + config.windowMs - now;
    return {
      allowed: true,
      limit: config.maxRequests,
      remaining,
      resetSec: Math.max(1, Math.ceil(resetMs / 1000,),),
    };
  }

  /**
   * Backward-compatible boolean check.
   * Records the request on success (same as consume().allowed === true).
   * Does NOT record on failure (caller is blocked).
   * @param key
   */
  function check(key: string,): boolean {
    return consume(key,).allowed;
  }

  /**
   * Reset counter for a specific key
   * @param key
   */
  function reset(key: string,): void {
    timestamps.delete(key,);
  }

  /** Clear all buckets and stop pruning */
  function clearAll(): void {
    timestamps.clear();
  }

  /** */
  function destroy(): void {
    clearInterval(pruneInterval,);
    timestamps.clear();
  }

  return { check, clear: clearAll, consume, destroy, reset, };
}

/** */
export type RateLimiter = ReturnType<typeof createRateLimiter>;

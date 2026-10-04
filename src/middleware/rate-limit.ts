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
 * Two-step gate flows (peek / record / refund, see BUG-register-rate-limiter-consumes-on-username-collision-retries)
 * let callers gate before an expensive effect and only count committed work.
 * `consume()` is still the right primitive when there is no expensive-or-skippable
 * work between gate and effect (login, demo-login, IP-level DOS protection).
 */

/** Outcome of a single rate-limit gate check. */
export interface RateLimitResult {
  /** True iff the request is within budget. */
  allowed: boolean;
  /** Configured maximum requests per window. */
  limit: number;
  /** Remaining requests in the current window (post-recording for consume). */
  remaining: number;
  /** Whole seconds until the oldest in-window timestamp ages out. */
  resetSec: number;
}

/** Build the headers for a 429 (or informational) response. */
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
 */
export function createRateLimiter(config: RateLimitConfig,) {
  // Per-key queue of timestamps (ms). The queue length is bounded by
  // maxRequests for any key in normal operation.
  const timestamps = new Map<string, number[]>();

  // Drop timestamps that fell out of the window. BUG-rate-limit-off-by-one:
  // strict boundary (sliding-window math). A timestamp exactly AT `cutoff`
  // (now - windowMs == ts) is still in-window and is KEPT; only timestamps
  // strictly older than the cutoff are dropped.
  function pruneExpired(queue: number[], cutoff: number,): void {
    while (queue.length > 0 && queue[0]! < cutoff) { queue.shift(); }
  }

  // Sweep idle keys (empty after prune) and clear their queue.
  const pruneInterval = setInterval(() => {
    const cutoff = Date.now() - config.windowMs;
    for (const [key, queue,] of timestamps) {
      pruneExpired(queue, cutoff,);
      if (queue.length === 0) { timestamps.delete(key,); }
    }
  }, config.windowMs,);

  /**
   * Record a request and report whether it is within budget.
   * `consume()` is the single source of truth for one-step flows: it
   * both checks and records. For two-step flows (gate before an
   * expensive effect, refund-or-record after) use {@link peek},
   * {@link record}, and {@link refund} instead.
   */
  function consume(key: string, now = Date.now(),): RateLimitResult {
    const cutoff = now - config.windowMs;
    let queue = timestamps.get(key,);
    if (!queue) {
      queue = [];
      timestamps.set(key, queue,);
    }

    pruneExpired(queue, cutoff,);

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
   * Inspect the bucket without recording. Returns the same shape as
   * {@link consume} so callers can reuse the 429-headers builder, but
   * `remaining` is pre-recording (i.e. the count of slots still free
   * if the request were accepted RIGHT NOW).
   *
   * Callers that reserve at the gate pair it with {@link record} on success
   * and {@link refund} on a post-gate skip. A peek-only caller records
   * nothing, so it must never refund — see {@link refund}.
   */
  function peek(key: string, now = Date.now(),): RateLimitResult {
    const cutoff = now - config.windowMs;
    const queue = timestamps.get(key,);
    if (!queue) {
      return {
        allowed: true,
        limit: config.maxRequests,
        remaining: config.maxRequests,
        resetSec: Math.max(1, Math.ceil(config.windowMs / 1000,),),
      };
    }

    pruneExpired(queue, cutoff,);
    const wouldBlock = queue.length >= config.maxRequests;
    const oldest = queue[0];
    const resetMs = oldest === undefined
      ? config.windowMs
      : oldest + config.windowMs - now;

    return {
      allowed: !wouldBlock,
      limit: config.maxRequests,
      remaining: Math.max(0, config.maxRequests - queue.length,),
      resetSec: Math.max(1, Math.ceil(resetMs / 1000,),),
    };
  }

  /**
   * Record a request against the bucket without re-checking. Call this
   * after a successful gate-and-effect so the bucket reflects only
   * committed work. If the queue is already at-or-above maxRequests by
   * the time `record()` runs (race: a concurrent request pushed us
   * over), the extra timestamp is still pushed — the next {@link peek}
   * or {@link consume} will block correctly. Keeping the over-budget
   * push is the simplest invariant: every record() corresponds to one
   * real request that touched the effect.
   */
  function record(key: string, now = Date.now(),): void {
    const cutoff = now - config.windowMs;
    let queue = timestamps.get(key,);
    if (!queue) {
      queue = [];
      timestamps.set(key, queue,);
    }

    pruneExpired(queue, cutoff,);
    queue.push(now,);
  }

  /**
   * Refund one request that was actually recorded. ONLY valid for callers
   * that made a record: {@link consume}, or an explicit {@link record}
   * reservation taken at the gate (see `routes/auth/register.ts`: peek →
   * record at the gate → refund on every post-gate skip such as a 409 from
   * insertUnique, a 422, or a rolled-back transaction).
   *
   * A peek-only flow has recorded nothing, so calling this there would pop
   * an unrelated successful request's timestamp and hand that client free
   * budget (BUG-refund-contract-invites-over-admission-in-peek-record-flows-).
   * Pops the most recent in-window timestamp for the key. If the queue is
   * empty (race: window expired between record and refund) this is a no-op.
   */
  function refund(key: string,): void {
    const queue = timestamps.get(key,);
    if (!queue || queue.length === 0) { return; }
    queue.pop();
    if (queue.length === 0) { timestamps.delete(key,); }
  }

  /**
   * Backward-compatible boolean check.
   * Records the request on success (same as consume().allowed === true).
   * Does NOT record on failure (caller is blocked).
   */
  function check(key: string,): boolean {
    return consume(key,).allowed;
  }

  /** Reset counter for a specific key. */
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

  return { check, clear: clearAll, consume, destroy, peek, record, refund, reset, };
}

/** */
export type RateLimiter = ReturnType<typeof createRateLimiter>;

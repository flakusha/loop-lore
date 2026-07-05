/**
 * Rate Limiting Middleware
 *
 * In-memory sliding-window rate limiter per IP.
 * Extracted from login route for general use.
 *
 * Usage:
 *   const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 100 });
 *   const allowed = limiter.check(clientIp);
 */

interface RateBucket {
  count: number;
  windowStart: number;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export function createRateLimiter(config: RateLimitConfig) {
  const buckets = new Map<string, RateBucket>();

  // Prune stale buckets every 2x window to prevent unbounded memory growth
  const pruneInterval = setInterval(() => {
    const cutoff = Date.now() - config.windowMs * 2;
    for (const [key, bucket] of buckets) {
      if (bucket.windowStart < cutoff) buckets.delete(key);
    }
  }, config.windowMs * 2);

  /** Check if request is allowed. Returns true if within limit. */
  function check(key: string): boolean {
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || now - bucket.windowStart > config.windowMs) {
      buckets.set(key, { count: 1, windowStart: now });
      return true;
    }

    if (bucket.count >= config.maxRequests) return false;

    bucket.count++;
    return true;
  }

  /** Reset counter for a specific key */
  function reset(key: string): void {
    buckets.delete(key);
  }

  /** Clear all buckets and stop pruning */
  function clearAll(): void {
    buckets.clear();
  }

  function destroy(): void {
    clearInterval(pruneInterval);
    buckets.clear();
  }

  return { check, reset, clear: clearAll, destroy };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;

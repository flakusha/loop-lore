// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Search-provider quarantine — one `CircuitBreaker` instance per search
 * provider, separate from the LLM generation breaker.
 *
 * Captcha → long quarantine (default 15 min). Rate-limit → short
 * cooldown from `Retry-After` (default 30s cap 5 min). Half-open probe
 * re-admits after cooldown expiry.
 */

import { CircuitBreaker, } from "../../generation/providers/circuit-breaker";
import { CaptchaBlockedError, ProviderRateLimitedError, } from "./errors";

/** Default quarantine after a captcha block (15 min). */
export const DEFAULT_CAPTCHA_QUARANTINE_MS = 15 * 60_000;
/** Fallback cooldown for rate-limits without `Retry-After` (30s). */
export const DEFAULT_RATELIMIT_COOLDOWN_MS = 30_000;

/** Search-scoped breaker: thresholds tuned for bursty scrape paths. */
export const searchBreaker = new CircuitBreaker();

function ensure(provider: string,): void {
  searchBreaker.register(provider, { threshold: 1, baseCooldownMs: 30_000, maxCooldownMs: 3_600_000, },);
}

/**
 * Record a captcha block and open a long quarantine.
 * @param provider - Blocked provider
 * @param quarantineMs - Quarantine duration
 */
export function quarantineOnCaptcha(provider: string, quarantineMs: number = DEFAULT_CAPTCHA_QUARANTINE_MS,): void {
  ensure(provider,);
  // Threshold 1 → single onFailure opens the circuit; Retry-After-equivalent
  // slot carries the long quarantine duration.
  searchBreaker.onFailure(provider, quarantineMs,);
}

/**
 * Record a rate-limit with server-directed cooldown.
 * @param provider - Limited provider
 * @param retryAfterMs - Cooldown from header or backoff
 */
export function quarantineOnRateLimit(
  provider: string,
  retryAfterMs: number = DEFAULT_RATELIMIT_COOLDOWN_MS,
): void {
  ensure(provider,);
  searchBreaker.onFailure(provider, retryAfterMs,);
}

/**
 * Whether a provider may receive a search request now.
 * @param provider - Provider name
 */
export function maySearch(provider: string,): boolean {
  return searchBreaker.allowRequest(provider,);
}

/** Re-throw helper: captcha errors quarantine as a side effect. */
export function trackSearchError(error: unknown,): never {
  if (error instanceof CaptchaBlockedError) {
    quarantineOnCaptcha(error.provider, error.quarantineMs,);
  } else if (error instanceof ProviderRateLimitedError) {
    quarantineOnRateLimit(error.provider, error.retryAfterMs,);
  }
  throw error;
}

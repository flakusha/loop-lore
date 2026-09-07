// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * RAG search error taxonomy — captcha vs rate-limit split.
 *
 * Captcha is non-retryable on the same provider (retry escalates to IP
 * ban); rate-limit is retryable after `Retry-After`. The orchestrator
 * quarantines on the former, backs off on the latter.
 */

/** Base for provider failures carrying retry guidance. */
export class SearchProviderError extends Error {
  /** Machine-readable code. */
  readonly code: string;
  /** True when retrying the same provider may succeed. */
  readonly retryable: boolean;
  constructor(code: string, message: string, retryable: boolean,) {
    super(message,);
    this.name = "SearchProviderError";
    this.code = code;
    this.retryable = retryable;
  }
}

/**
 * Captcha/challenge block — NEVER retry the same provider for this query.
 * @param provider - Quarantined provider name
 * @param quarantineMs - Requested quarantine duration
 */
export class CaptchaBlockedError extends SearchProviderError {
  /** Provider to quarantine. */
  readonly provider: string;
  /** Requested quarantine duration in ms. */
  readonly quarantineMs: number;
  constructor(provider: string, quarantineMs: number, detail = "captcha challenge",) {
    super("CAPTCHA_BLOCKED", `${provider} blocked by ${detail}; quarantined`, false,);
    this.name = "CaptchaBlockedError";
    this.provider = provider;
    this.quarantineMs = quarantineMs;
  }
}

/**
 * Rate-limit hit — retryable after `retryAfterMs`.
 * @param provider - Limited provider name
 * @param retryAfterMs - Delay from `Retry-After` or backoff
 */
export class ProviderRateLimitedError extends SearchProviderError {
  /** Provider to back off. */
  readonly provider: string;
  /** Delay before retry in ms. */
  readonly retryAfterMs: number;
  constructor(provider: string, retryAfterMs: number,) {
    super("RATE_LIMITED", `${provider} rate limited; retry after ${retryAfterMs}ms`, true,);
    this.name = "ProviderRateLimitedError";
    this.provider = provider;
    this.retryAfterMs = retryAfterMs;
  }
}

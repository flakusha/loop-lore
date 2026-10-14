// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Ownership: HTTP-status retryability — the ONE piece of classification shared
// by every retry mechanism in the repo.
//
// Four retry mechanisms exist and are deliberately NOT merged; they differ in
// what they retry and in how they drive the loop:
//   * provider LLM calls — `generation/providers/retry.ts` (Effect `Schedule`),
//     reads `ProviderError.retryable`, which the provider http modules set from
//     this function.
//   * HTTP fetch — `utils/safe-fetch/retry.ts` (promise loop over `safeFetch`).
//   * DB unique-violation retry — `utils/swipe-retry.ts` (no HTTP; classifies
//     SQLite constraint text).
//   * pure delay math — `utils/backoff.ts` (no errors at all).
// Only the status-to-retryable rule is shared. Control flow is not: one path is
// Effect-native, the others are promise-native, and forcing them together would
// be worse than the duplication.

/**
 * Whether an HTTP status is worth a second attempt.
 *
 * Retryable: 5xx (server-side fault that may not recur), 429 (the server
 * explicitly asks the client to back off and retry), 408 (the server gave up
 * waiting for the request — the request itself is fine). Everything else is
 * not: a 4xx other than 408/429 describes the request, so replaying it wastes
 * the budget and, under load, deepens the problem.
 * @param status - HTTP status code carried by the failed response
 * @returns {boolean} true for 408, 429 and any 5xx
 */
export function isRetryableHttpStatus(status: number,): boolean {
  return status === 408 || status === 429 || status >= 500;
}

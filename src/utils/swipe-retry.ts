// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared bounded-retry frame for the three swipe-index INSERT sites
 * (routes/messages/swipe-race-insert.ts, generation/auto-gen/store-message.ts,
 * routes/messages/reply.ts) plus the swipe unique-violation classifier they
 * share.
 */

/**
 * Detect whether an error from the swipe-index INSERT path is the unique
 * violation we expect to retry. Matches BOTH the Kysely/SQLite text form
 * (`UNIQUE constraint failed: messages.swipe_index`) AND a more specific
 * guard against the unique index name (`idx_messages_swipe_unique`) in
 * case the driver changes the message text. Scoped to the columns covered
 * by the unique index so we never accidentally swallow an unrelated unique
 * violation (e.g. `idx_messages_idempotency` on a colliding idempotency_key —
 * that is a real conflict and must NOT trigger a swipe_index retry).
 * @param err
 * @returns {boolean}
 */
export function isSwipeIndexUniqueViolation(err: unknown,): boolean {
  if (!(err instanceof Error)) { return false; }
  const msg = err.message;
  return /UNIQUE constraint failed:\s*messages\.(chat_id|parent_id|swipe_index)\b/i.test(msg,) ||
    /SQLITE_CONSTRAINT(?:_UNIQUE)?\b.*idx_messages_swipe_unique/i.test(msg,);
}

/** Outcome of {@link retryBounded}. */
export interface RetryOutcome<T,> {
  /** True when an attempt succeeded; false when attempts were exhausted. */
  ok: boolean;
  /** Value returned by the successful attempt (when `ok`). */
  value?: T;
  /** Last error seen (when `!ok`). */
  lastError?: unknown;
}

export interface RetryBoundedOpts<T,> {
  /** Maximum number of attempts (sites use 8). */
  attempts: number;
  /**
   * Whether a thrown error is retryable. Non-retryable errors are rethrown
   * immediately. Pass `() => true` to retry any error.
   */
  isRetryable: (err: unknown,) => boolean;
  /** One attempt; return the value to surface on success. */
  onAttempt: () => Promise<T>;
}

/**
 * Run `onAttempt` up to `attempts` times. Retryable errors loop; a
 * non-retryable error is rethrown as-is; exhausting the budget returns
 * `{ ok: false, lastError }` instead of throwing.
 * @param opts
 * @throws The original error when `isRetryable` returns false.
 * @returns {Promise<RetryOutcome<T>>}
 */
export async function retryBounded<T,>(
  opts: RetryBoundedOpts<T>,
): Promise<RetryOutcome<T>> {
  let lastError: unknown;
  for (let attempt = 0; attempt < opts.attempts; attempt++) {
    try {
      const value = await opts.onAttempt();
      return { ok: true, value, };
    } catch (err) {
      if (!opts.isRetryable(err,)) { throw err; }
      lastError = err;
    }
  }

  return { ok: false, lastError, };
}

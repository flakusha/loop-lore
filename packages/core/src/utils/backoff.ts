// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared exponential-backoff calculation (in-process only).
 *
 * One formula for the delay curves that used to be copy-pasted as
 * `base * 2 ** (attempt - 1)` at each site. Attempts are 1-based: attempt 1
 * waits `baseMs`, attempt 2 waits `2 * baseMs`, and so on. When `capMs` is
 * given the delay is clamped to it; without a cap the curve grows unbounded.
 *
 * Not an `effect` `Schedule`: two of the three call sites are pure delay
 * calculators (no retry loop to drive), so wrapping them in `Effect` adds a
 * runtime dependency for no behavioral gain. DB-persisted backoff
 * (`src/federation/outbox.ts`) deliberately keeps its own inline formula —
 * the delay there is written into a row, not slept in-process.
 */

/** Options for {@link exponentialBackoffMs}. */
export interface BackoffOptions {
  /** Delay for the first attempt, in ms. */
  baseMs: number;
  /** 1-based attempt number (values < 1 clamp to the first attempt). */
  attempt: number;
  /** Optional delay ceiling in ms. */
  capMs?: number;
}

/**
 * Exponential backoff delay for an attempt: `baseMs * 2^(attempt - 1)`, capped.
 * @param opts - Base delay, 1-based attempt, optional cap
 * @returns The delay in ms (never negative)
 */
export function exponentialBackoffMs(opts: BackoffOptions,): number {
  const raw = opts.baseMs * 2 ** (Math.max(1, opts.attempt,) - 1);
  return opts.capMs === undefined ? raw : Math.min(raw, opts.capMs,);
}

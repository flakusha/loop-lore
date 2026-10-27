// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `QuotaExceededError` — a USER-level quota limit for assistant entity-access
 * operations. Distinct from provider 429s: this is our own pre-call
 * enforcement, not an external rate limit.
 */

/** Details carried by every quota rejection. */
export interface QuotaExceededDetails {
  /** Units the operation needs. */
  needed: number;
  /** Units still available in the current window. */
  available: number;
  /** Operation that was refused. */
  operation: string;
  /** Epoch ms when the current window resets. */
  resetsAt: number;
}

/** Thrown by {@link "src/assistant/quota/engine".enforceQuota} pre-call. */
export class QuotaExceededError extends Error {
  readonly details: QuotaExceededDetails;

  constructor(message: string, details: QuotaExceededDetails,) {
    super(message,);
    this.name = "QuotaExceededError";
    this.details = details;
  }
}

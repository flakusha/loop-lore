// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/messages.ts — Messages config type

export interface MessagesConfig {
  /** Auto-mark invalid messages as hidden */
  autoHideInvalid: boolean;
  /** Require confirmation before hiding */
  hideConfirmation: boolean;
  /** Max content length (plaintext before encrypt) */
  maxLength: number;
  /** Max auto-retry on LLM failure */
  maxGenerationRetries: number;
  /** LLM response timeout in ms */
  generationTimeoutMs: number;
  /** Idempotency key TTL in hours */
  idempotencyExpiryHours: number;
}

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/messages.ts — messages section defaults
import type { MessagesConfig, } from "../schema";

export const MESSAGES_DEFAULTS = {
  autoHideInvalid: false,
  hideConfirmation: true,
  maxLength: 100_000,
  maxGenerationRetries: 3,
  generationTimeoutMs: 30_000,
  idempotencyExpiryHours: 24,
} satisfies MessagesConfig;

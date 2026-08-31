// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/sections/messages.ts — Messages config section

import type { MessagesConfig, } from "../schema";

export const MESSAGES_DEFAULTS = {
  autoHideInvalid: false,
  hideConfirmation: true,
  maxLength: 100_000,
  maxGenerationRetries: 3,
  generationTimeoutMs: 30_000,
  idempotencyExpiryHours: 24,
} satisfies MessagesConfig;

/** */
export class MessagesSection implements MessagesConfig {
  autoHideInvalid = MESSAGES_DEFAULTS.autoHideInvalid;
  hideConfirmation = MESSAGES_DEFAULTS.hideConfirmation;
  maxLength = MESSAGES_DEFAULTS.maxLength;
  maxGenerationRetries = MESSAGES_DEFAULTS.maxGenerationRetries;
  generationTimeoutMs = MESSAGES_DEFAULTS.generationTimeoutMs;
  idempotencyExpiryHours = MESSAGES_DEFAULTS.idempotencyExpiryHours;

  /**
   * @param overrides
   */
  constructor(overrides?: Partial<MessagesConfig>,) {
    Object.assign(this, overrides,);
  }
}

export const messagesMeta = {
  type: "object" as const,
  description: "Message configuration",
  properties: {
    autoHideInvalid: {
      type: "boolean",
      default: MESSAGES_DEFAULTS.autoHideInvalid,
      description: "Auto-mark invalid messages as hidden",
    },
    hideConfirmation: {
      type: "boolean",
      default: MESSAGES_DEFAULTS.hideConfirmation,
      description: "Require confirmation before hiding",
    },
    maxLength: { type: "integer", default: MESSAGES_DEFAULTS.maxLength, description: "Max content length", },
    maxGenerationRetries: {
      type: "integer",
      default: MESSAGES_DEFAULTS.maxGenerationRetries,
      description: "Max auto-retry on LLM failure",
    },
    generationTimeoutMs: {
      type: "integer",
      default: MESSAGES_DEFAULTS.generationTimeoutMs,
      description: "LLM response timeout in ms",
    },
    idempotencyExpiryHours: {
      type: "integer",
      default: MESSAGES_DEFAULTS.idempotencyExpiryHours,
      description: "Idempotency key TTL in hours",
    },
  },
  required: [
    "autoHideInvalid",
    "hideConfirmation",
    "maxLength",
    "maxGenerationRetries",
    "generationTimeoutMs",
    "idempotencyExpiryHours",
  ] as const,
};

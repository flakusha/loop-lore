// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/json-schema/messages.ts — messages JSON Schema section
export const messages = {
  type: "object",
  description: "Message configuration",
  properties: {
    autoHideInvalid: {
      type: "boolean",
      default: false,
      description: "Auto-mark invalid messages as hidden",
    },
    hideConfirmation: {
      type: "boolean",
      default: true,
      description: "Require confirmation before hiding",
    },
    maxLength: { type: "integer", default: 100_000, description: "Max content length", },
    maxGenerationRetries: {
      type: "integer",
      default: 3,
      description: "Max auto-retry on LLM failure",
    },
    generationTimeoutMs: {
      type: "integer",
      default: 30_000,
      description: "LLM response timeout in ms",
    },
    idempotencyExpiryHours: {
      type: "integer",
      default: 24,
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
  ],
};

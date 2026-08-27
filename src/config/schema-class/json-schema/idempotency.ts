// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/json-schema/idempotency.ts — idempotency JSON Schema section

export const idempotency = {
  type: "object",
  description: "Global idempotency middleware for re-fired mutating requests",
  properties: {
    enabled: {
      type: "boolean",
      default: true,
      description: "Enable the global idempotency middleware. Env: IDEMPOTENCY_ENABLED=0 to disable.",
    },
    backend: {
      type: "string",
      enum: ["memory", "table",],
      default: "memory",
      description:
        "Cache backend: 'memory' (single-instance) or 'table' (shared across instances via request_results). Env: IDEMPOTENCY_BACKEND.",
    },
    ttlMs: {
      type: "integer",
      minimum: 1000,
      default: 86_400_000,
      description: "TTL for cached idempotent responses in ms. Default 24h. Env: IDEMPOTENCY_TTL_MS.",
    },
    bypassHeader: {
      type: "boolean",
      default: true,
      description: "Honor X-Idempotency-Bypass: 1 to skip the cache. Env: IDEMPOTENCY_BYPASS_HEADER=0 to disable.",
    },
  },
  required: ["enabled", "backend", "ttlMs", "bypassHeader",],
};

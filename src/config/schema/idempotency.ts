// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/idempotency.ts — idempotency middleware configuration

import type { IdempotencyBackend, } from "../../middleware/idempotency";

export interface IdempotencyConfig {
  /** Enable the global idempotency middleware. Default: true. */
  enabled: boolean;
  /** Backend for cached responses: "memory" (single-instance) or "table" (shared). */
  backend: IdempotencyBackend;
  /** TTL for cached responses in ms. Default: 24h. */
  ttlMs: number;
  /**
   * Honor the X-Idempotency-Bypass header. When the client sends
   * `X-Idempotency-Bypass: 1`, the middleware skips the cache and lets the
   * handler run. Default: true.
   */
  bypassHeader: boolean;
}

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/idempotency.ts — idempotency section defaults
import type { IdempotencyConfig, } from "../schema/idempotency";

const DAY_MS = 24 * 60 * 60 * 1000;

export const IDEMPOTENCY_DEFAULTS = {
  enabled: true,
  backend: "memory",
  ttlMs: DAY_MS,
  bypassHeader: true,
} satisfies IdempotencyConfig;

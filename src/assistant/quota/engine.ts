// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Quota engine for assistant entity-access operations (epic core principle
 * "Quota-aware"). Pre-call enforcement: every LLM/expensive command checks
 * and deducts BEFORE doing work, throwing {@link QuotaExceededError}.
 *
 * Costs are the ticket's table ×2 (integer units; the ticket's 0.5-unit
 * preview becomes 1). The limit/window compose with the federation
 * performance-quota cell pattern; rejections are logged via the project
 * logger with a structured `assistant_quota_exceeded` event.
 */

import { ASSISTANT_QUOTA_DEFAULTS, } from "../../config/sections/assistant";
import type { Logger, } from "../../logger";
import { getLogger, } from "../../logger";
import {
  QuotaExceededError,
} from "./errors";
import {
  configureQuotaStorage,
  consumeQuota,
  type QuotaStorageOptions,
  quotaStorageOptions,
  resetUserQuota,
} from "./storage";

export { QuotaExceededError, } from "./errors";
export type { QuotaExceededDetails, } from "./errors";

/** Operations that consume quota, with their per-call unit cost. */
export const QUOTA_OPERATION_COSTS = {
  "asset-preview": 1,
  "asset-search": 2,
  "rag-ask": 6,
  "rag-decompose": 6,
  "rag-preview": 2,
  "rag-search": 2,
  adapt: 10,
  duplicate: 2,
  import: 4,
  modify: 6,
} as const;

export type QuotaOperation = keyof typeof QUOTA_OPERATION_COSTS;

/** Lazy logger accessor — getLogger() throws before createLogger() (tests). */
const log = (): Logger => getLogger().child({ module: "assistant-quota", },);

/**
 * Reconfigure the quota window (admin/tests). Drops all counters.
 * @param options - window length and per-user limit
 */
export function configureAssistantQuota(options: QuotaStorageOptions,): void {
  configureQuotaStorage(options,);
}

/**
 * Apply the assistant config section's quota values (server boot + hot
 * reload). Drops all counters, matching the configure contract.
 * A stored config predating the assistant section falls back to the quota
 * defaults instead of crashing boot.
 * @param assistant - the assistant config section (quota fields read)
 */
export function initAssistantQuota(
  assistant?: { quotaWindowMs: number; quotaLimitPerWindow: number } | null,
): void {
  const quotaWindowMs = assistant?.quotaWindowMs ?? ASSISTANT_QUOTA_DEFAULTS.quotaWindowMs;
  const quotaLimitPerWindow = assistant?.quotaLimitPerWindow ?? ASSISTANT_QUOTA_DEFAULTS.quotaLimitPerWindow;
  configureQuotaStorage({
    windowMs: quotaWindowMs,
    limitPerWindow: quotaLimitPerWindow,
  },);
}

/**
 * Drop one user's counters (admin reset/tests).
 * @param userId - user whose window is dropped
 */
export function resetAssistantQuota(userId: string,): void {
  resetUserQuota(userId,);
}

/**
 * Check-and-deduct quota for one operation BEFORE it runs.
 * @param userId - authenticated caller (null → unauthenticated, refused)
 * @param operation - the quota-consuming operation
 * @param now - epoch ms (injectable for deterministic tests)
 * @throws {QuotaExceededError} when the cost does not fit the window
 */
export function enforceQuota(userId: string | null, operation: QuotaOperation, now = Date.now(),): void {
  const cost = QUOTA_OPERATION_COSTS[operation];
  const { limitPerWindow, windowMs, } = quotaStorageOptions();

  // An unauthenticated caller has no user scope to charge; refuse loudly so
  // the command layer reports it instead of silently skipping enforcement.
  if (!userId) {
    throw new QuotaExceededError("Quota requires an authenticated user.", {
      needed: cost,
      available: 0,
      operation,
      resetsAt: now + windowMs,
    },);
  }

  const remaining = consumeQuota(userId, cost, now,);
  if (remaining === null) {
    log().warn("assistant quota exceeded", {
      event: "assistant_quota_exceeded",
      needed: cost,
      operation,
      userId,
      windowLimit: limitPerWindow,
    },);

    throw new QuotaExceededError(
      `Quota exceeded. Need ${cost} units, have none left in the current window.`,
      { needed: cost, available: 0, operation, resetsAt: now + windowMs, },
    );
  }
}

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Per-user quota storage for assistant entity-access operations.
 *
 * Two backends behind one synchronous interface:
 * - DB-backed (default when a sqlite handle is available): persistent
 *   fixed-window counters in `assistant_quota_usage` — cross-process safe,
 *   see {@link "src/assistant/quota/db-storage"}.
 * - In-process per-user counters (the `performance-quota.ts` cell pattern):
 *   the fallback for unit suites without a DB handle.
 *
 * The configure/reset hooks operate on whichever backend is active; limits
 * come from {@link "src/assistant/quota/engine".configureAssistantQuota}.
 */

import { ASSISTANT_QUOTA_DEFAULTS, } from "../../config/sections/assistant";
import { clearQuotaDb, consumeQuotaDb, quotaDatabase, resetQuotaDbUser, } from "./db-storage";

/** One user's window state. */
export interface QuotaWindow {
  used: number;
  windowStart: number;
}

/** Storage settings supplied by the engine. */
export interface QuotaStorageOptions {
  /** Window length in ms. */
  windowMs: number;
  /** Units available per user per window. */
  limitPerWindow: number;
}

/** Mutable module settings; tests override via the engine's configure hook. */
const settings: QuotaStorageOptions = {
  windowMs: ASSISTANT_QUOTA_DEFAULTS.quotaWindowMs,
  limitPerWindow: ASSISTANT_QUOTA_DEFAULTS.quotaLimitPerWindow,
};

/** userId → window counters. */
const windows = new Map<string, QuotaWindow>();

/**
 * Replace the storage settings and drop all counters on the ACTIVE backend
 * (deterministic tests, admin reconfiguration).
 * @param options - the new window length and per-window limit
 */
export function configureQuotaStorage(options: QuotaStorageOptions,): void {
  settings.windowMs = options.windowMs;
  settings.limitPerWindow = options.limitPerWindow;
  windows.clear();
  const db = quotaDatabase();
  if (db) { clearQuotaDb(db,); }
}

/**
 * Read the active settings.
 * @returns the configured window length and per-window limit
 */
export function quotaStorageOptions(): QuotaStorageOptions {
  return { ...settings, };
}

/**
 * Check-and-deduct atomically for one user on the ACTIVE backend, lazily
 * resetting the window. The DB-backed deduction is a single guarded upsert
 * ({@link consumeQuotaDb}) so concurrent deductions cannot overshoot.
 * @param userId - authenticated caller
 * @param cost - units the operation consumes
 * @param now - current epoch ms (injectable for deterministic tests)
 * @returns the remaining units AFTER deduction, or null when the cost does not fit
 */
export function consumeQuota(userId: string, cost: number, now: number,): number | null {
  const db = quotaDatabase();
  if (db) {
    return consumeQuotaDb({
      cost,
      db,
      limitPerWindow: settings.limitPerWindow,
      now,
      userId,
      windowMs: settings.windowMs,
    },);
  }

  const current = windows.get(userId,);
  const active = current && now - current.windowStart < settings.windowMs
    ? current
    : { used: 0, windowStart: now, };

  if (active.used + cost > settings.limitPerWindow) { return null; }

  active.used += cost;
  windows.set(userId, active,);
  return settings.limitPerWindow - active.used;
}

/**
 * Drop one user's counters on the ACTIVE backend (tests; admin reset).
 * @param userId - user whose window is dropped
 */
export function resetUserQuota(userId: string,): void {
  windows.delete(userId,);
  const db = quotaDatabase();
  if (db) { resetQuotaDbUser(db, userId,); }
}

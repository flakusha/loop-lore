// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Per-user quota storage for assistant entity-access operations.
 *
 * In-process fixed-window counters (the `performance-quota.ts` cell
 * pattern): O(1) check-and-deduct, lazy window reset, no schema change —
 * the epic explicitly must not need a migration, and the ticket's `quota`
 * table row is deferred until cross-process quotas are actually required.
 * Limits come from {@link "src/assistant/quota/engine".configureAssistantQuota}.
 */

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

/** Seconds per day (default window). */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Mutable module settings; tests override via the engine's configure hook. */
const settings: QuotaStorageOptions = { windowMs: DAY_MS, limitPerWindow: 200, };

/** userId → window counters. */
const windows = new Map<string, QuotaWindow>();

/**
 * Replace the storage settings and drop all counters (deterministic tests,
 * admin reconfiguration).
 * @param options - the new window length and per-window limit
 */
export function configureQuotaStorage(options: QuotaStorageOptions,): void {
  settings.windowMs = options.windowMs;
  settings.limitPerWindow = options.limitPerWindow;
  windows.clear();
}

/**
 * Read the active settings.
 * @returns the configured window length and per-window limit
 */
export function quotaStorageOptions(): QuotaStorageOptions {
  return { ...settings, };
}

/**
 * Check-and-deduct atomically for one user, lazily resetting the window.
 * @param userId - authenticated caller
 * @param cost - units the operation consumes
 * @param now - current epoch ms (injectable for deterministic tests)
 * @returns the remaining units AFTER deduction, or null when the cost does not fit
 */
export function consumeQuota(userId: string, cost: number, now: number,): number | null {
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
 * Drop one user's counters (tests; admin reset).
 * @param userId - user whose window is dropped
 */
export function resetUserQuota(userId: string,): void {
  windows.delete(userId,);
}

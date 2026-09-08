// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Search time-cap config — 3-tier resolution (user > admin > global).
 *
 * Pure and isomorphic: backend routes and `src/frontend/` surfaces resolve
 * caps with the same function. Gallery pagination and message search both
 * cap slow tiers (fuzzy/vector) while letting exact DB lookups run uncapped
 * when every tier leaves the cap unset.
 */

/** One tier of the time-cap ladder. */
export interface TimeCapTier {
  /** Typical-query budget in ms. */
  defaultMs?: number;
  /** Hard abort in ms; exceeding throws `SearchTimeoutError`. */
  maxMs?: number;
}

/** Full 3-tier config. Only `global` is required; admin/user override sparsely. */
export interface SearchTimeCapConfig {
  /** Instance default — applied when admin/user overrides are unset. */
  global: TimeCapTier;
  /** Admin (instance-level) override. */
  admin?: TimeCapTier;
  /** Per-user preference override. */
  user?: TimeCapTier;
}

/** Resolved effective caps for one query. */
export interface ResolvedTimeCap {
  /** Effective typical-query budget in ms. */
  defaultMs: number;
  /** Effective hard abort in ms. */
  maxMs: number;
}

/** Built-in fallback when no tier sets a value. */
export const DEFAULT_GLOBAL_CAP: Required<TimeCapTier> = {
  defaultMs: 500,
  maxMs: 2000,
};

/**
 * Resolve the effective time cap. Precedence: user > admin > global > builtin.
 * Each field resolves independently, so a user `defaultMs` composes with an
 * admin `maxMs` instead of discarding it.
 * @param config - 3-tier config
 * @returns effective caps
 * @example
 * ```ts
 * resolveTimeCap({ global: { defaultMs: 500, maxMs: 2000 }, user: { maxMs: 300 } });
 * // → { defaultMs: 500, maxMs: 300 }
 * ```
 */
export function resolveTimeCap(config: SearchTimeCapConfig,): ResolvedTimeCap {
  const pick = (
    field: "defaultMs" | "maxMs",
  ): number =>
    config.user?.[field] ??
      config.admin?.[field] ??
      config.global[field] ??
      DEFAULT_GLOBAL_CAP[field];
  return { defaultMs: pick("defaultMs",), maxMs: pick("maxMs",), };
}

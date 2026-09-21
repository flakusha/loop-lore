// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * lore-lifecycle-gate — extracted from `lore.ts` to keep that file under the
 * 250-line size limit. Composes the lifecycle gate (confidence floor +
 * disputed-wrap) into a single per-entry decision.
 *
 * The lifecycle fields (confidence / last_verified / distortion_level /
 * source_count / disputed) are present on `world_lore_entries` (005 migration)
 * and absent on `actor_lore_entries`. Default fallbacks here preserve the
 * pre-migration behavior for actor lore rows.
 *
 * Resolves: TASK-world-lore-lifecycle-confidence-decay-distortion
 */
import { effectiveConfidence, isDisputed, type LifecycleConfig, } from "../../lore/lifecycle";

/** Default values applied when a row lacks lifecycle fields (actor lore). */
export const LIFECYCLE_DEFAULTS = {
  confidence: 100,
  last_verified: null as string | null,
  distortion_level: 0,
  source_count: 1,
  disputed: 0,
} as const;

/** Subset of `LoreRow` lifecycle columns (all optional; resolved against defaults). */
export interface LifecycleRowSlice {
  confidence?: number;
  last_verified?: string | null;
  distortion_level?: number;
  disputed?: number;
}

/**
 * Decide whether `entry` survives the configured `min_confidence` floor.
 * With defaults (`min_confidence = 25`, `decay_per_day = 0`,
 * `distortion_cap = 80`) and legacy `confidence = 100, distortion_level = 0`
 * rows, this is a no-op for worlds that have not opted in.
 *
 * **Runtime invariant:** `worldDaysSince` is pinned to `0` because the
 * `worlds` table has no world-clock column. Temporal decay is therefore a
 * no-op. To re-enable decay, plumb a real days-since value through
 * `loadLore` and pass it down here.
 * @param entry
 * @param cfg
 * @returns True when the row's effective confidence is at or above `cfg.min_confidence`.
 */
export function passesConfidenceFloor(
  entry: LifecycleRowSlice,
  cfg: LifecycleConfig,
): boolean {
  const confidence = effectiveConfidence(
    {
      confidence: entry.confidence ?? LIFECYCLE_DEFAULTS.confidence,
      last_verified: entry.last_verified ?? LIFECYCLE_DEFAULTS.last_verified,
      distortion_level: entry.distortion_level ?? LIFECYCLE_DEFAULTS.distortion_level,
    },
    /* worldDaysSince: number */ 0,
    cfg,
  );
  return confidence >= cfg.min_confidence;
}

/**
 * Decide whether `entry` should be wrapped in `<disputed>` (manual flag or
 * distortion_level >= cfg.distortion_cap).
 * @param entry
 * @param cfg
 * @returns True when the row is flagged or distortion has crossed `cfg.distortion_cap`.
 */
export function isLoreDisputed(
  entry: LifecycleRowSlice,
  cfg: LifecycleConfig,
): boolean {
  if ((entry.disputed ?? LIFECYCLE_DEFAULTS.disputed) === 1) { return true; }
  return isDisputed(
    {
      confidence: entry.confidence ?? LIFECYCLE_DEFAULTS.confidence,
      last_verified: entry.last_verified ?? LIFECYCLE_DEFAULTS.last_verified,
      distortion_level: entry.distortion_level ?? LIFECYCLE_DEFAULTS.distortion_level,
    },
    cfg,
  );
}

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Lore lifecycle — confidence / decay / distortion resolver.
 *
 * Pure functions (no DB I/O) used by `loreSection` to decide whether a
 * `world_lore_entries` row still deserves a spot in the prompt:
 *
 * - `effectiveConfidence` returns the time-and-distortion-adjusted confidence
 *   of a row. Rows with `last_verified = NULL` (legacy / never-verified) are
 *   treated as fresh (`confidence` unchanged) so the migration is identity
 *   for the default `confidence = 100` case.
 * - `isDisputed` flags rows whose `distortion_level` has crossed the
 *   configured cap (default 80). Disputed entries are not dropped; they are
 *   wrapped in `<disputed>` so downstream consumers can choose to surface
 *   them with reduced trust.
 * - `resolveLifecycleConfig` parses `lifecycle_config` out of a world's
 *   `worlds.rules` JSON; absent key -> defaults.
 *
 * Defaults are tuned to be invisible for legacy worlds that have not opted
 * in: `effectiveConfidence === row.confidence`, `disputed === false`.
 */

/** Lifecycle knobs a world can set under `worlds.rules.lifecycle_config`. */
export interface LifecycleConfig {
  /** Drop entries whose effective confidence is strictly less than this. 0..100. Default 25. */
  min_confidence: number;
  /**
 * Confidence points lost per world-day since `last_verified`. **Default 0**
 * because no world-clock column exists yet (see BUG-lore-decay-gate-…).
 */
  decay_per_day: number;
  /** distortion_level >= this marks the entry as "disputed". 0..100. Default 80. */
  distortion_cap: number;
}

/** Defaults used when `worlds.rules.lifecycle_config` is absent. */
export const DEFAULT_LIFECYCLE_CONFIG: LifecycleConfig = Object.freeze({
  min_confidence: 25,
  decay_per_day: 0,
  distortion_cap: 80,
},);

/** Shape consumed by the resolver — matches the DB row plus the legacy columns. */
export interface LifecycleRow {
  confidence: number;
  last_verified: string | null;
  distortion_level: number;
  source_count?: number;
}

/**
 * Clamp a numeric input to the [lo, hi] range. NaN -> lo.
 * @param value
 * @param lo
 * @param hi
 * @returns The clamped value.
 */
function clamp(value: number, lo: number, hi: number,): number {
  if (!Number.isFinite(value,)) { return lo; }
  if (value < lo) { return lo; }
  if (value > hi) { return hi; }
  return value;
}

/**
 * Compute the effective confidence of a row after temporal decay and
 * distortion. Pure function; `worldDaysSince` is the world-clock days
 * elapsed since `last_verified` (0 if unknown).
 *
 * Identity properties:
 *   - `last_verified = NULL` -> no decay (decay is undefined for never-verified).
 *   - `worldDaysSince <= 0` -> no decay.
 *   - `distortion_level` is subtracted from `confidence`, clamped to [0, 100].
 *   - Result is clamped to [0, 100].
 * @param row
 * @param worldDaysSince
 * @param cfg
 * @returns The adjusted confidence in [0, 100].
 */
export function effectiveConfidence(
  row: LifecycleRow,
  worldDaysSince: number,
  cfg: LifecycleConfig,
): number {
  const base = clamp(row.confidence, 0, 100,);
  const distortion = clamp(row.distortion_level, 0, 100,);
  // Decay applies only when `last_verified` is known AND elapsed days > 0.
  // Never-verified rows (last_verified = null) are exempt — there is no
  // baseline from which to measure decay.
  const elapsed = row.last_verified == null
    ? 0
    : Number.isFinite(worldDaysSince,) && worldDaysSince > 0
    ? worldDaysSince
    : 0;
  const decayed = base - elapsed * cfg.decay_per_day;
  const adjusted = decayed - distortion;
  return clamp(adjusted, 0, 100,);
}

/**
 * Mark entries whose distortion has crossed the cap as "disputed". The
 * caller decides whether to surface them (we wrap; we don't drop).
 * @param row
 * @param cfg
 * @returns True when the row's distortion has crossed `cfg.distortion_cap`.
 */
export function isDisputed(row: LifecycleRow, cfg: LifecycleConfig,): boolean {
  return clamp(row.distortion_level, 0, 100,) >= cfg.distortion_cap;
}

/**
 * Parse a `lifecycle_config` block out of `worlds.rules` JSON. Unknown /
 * malformed values fall back to the defaults; partial overrides merge.
 * @param rules
 * @returns A fully-populated {@link LifecycleConfig} (never `undefined`).
 */
export function resolveLifecycleConfig(
  rules: unknown,
): LifecycleConfig {
  if (!rules || typeof rules !== "object") { return { ...DEFAULT_LIFECYCLE_CONFIG, }; }
  const block = (rules as Record<string, unknown>).lifecycle_config;
  if (!block || typeof block !== "object") { return { ...DEFAULT_LIFECYCLE_CONFIG, }; }
  const raw = block as Partial<LifecycleConfig>;
  return {
    min_confidence: typeof raw.min_confidence === "number"
      ? clamp(raw.min_confidence, 0, 100,)
      : DEFAULT_LIFECYCLE_CONFIG.min_confidence,
    decay_per_day: typeof raw.decay_per_day === "number" && raw.decay_per_day >= 0
      ? raw.decay_per_day
      : DEFAULT_LIFECYCLE_CONFIG.decay_per_day,
    distortion_cap: typeof raw.distortion_cap === "number"
      ? clamp(raw.distortion_cap, 0, 100,)
      : DEFAULT_LIFECYCLE_CONFIG.distortion_cap,
  };
}

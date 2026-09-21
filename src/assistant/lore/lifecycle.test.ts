// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for `src/assistant/lore/lifecycle.ts`.
 *
 * Pure functions; no DB. Defends the math behind the prompt-time gate in
 * `loreSection`:
 *
 *   - `effectiveConfidence` — decay math, distortion subtraction, clamping,
 *     never-verified identity, negative/NaN safety.
 *   - `isDisputed` — threshold semantics.
 *   - `resolveLifecycleConfig` — partial overrides merge, malformed input
 *     falls back to defaults.
 */
import { describe, expect, test, } from "bun:test";
import {
  DEFAULT_LIFECYCLE_CONFIG,
  effectiveConfidence,
  isDisputed,
  type LifecycleConfig,
  type LifecycleRow,
  resolveLifecycleConfig,
} from "./lifecycle";

const cfg: LifecycleConfig = { ...DEFAULT_LIFECYCLE_CONFIG, };

describe("effectiveConfidence", () => {
  test("no decay when never verified (last_verified=null)", () => {
    const row: LifecycleRow = { confidence: 80, last_verified: null, distortion_level: 0, };
    // Even with a large worldDaysSince, null-verified rows don't decay.
    expect(effectiveConfidence(row, 365, cfg,),).toBe(80,);
  });

  test("no decay when worldDaysSince <= 0", () => {
    const row: LifecycleRow = { confidence: 80, last_verified: "2026-01-01", distortion_level: 0, };
    expect(effectiveConfidence(row, 0, cfg,),).toBe(80,);
    expect(effectiveConfidence(row, -5, cfg,),).toBe(80,);
  });

  test("decay subtracts decay_per_day * worldDaysSince", () => {
    const row: LifecycleRow = { confidence: 100, last_verified: "2026-01-01", distortion_level: 0, };
    // 100 - 0.5 * 10 = 95
    expect(effectiveConfidence(row, 10, cfg,),).toBeCloseTo(95,);
  });

  test("distortion subtracts from confidence", () => {
    const row: LifecycleRow = { confidence: 90, last_verified: null, distortion_level: 30, };
    expect(effectiveConfidence(row, 0, cfg,),).toBe(60,);
  });

  test("decay + distortion combine before clamp", () => {
    const row: LifecycleRow = { confidence: 90, last_verified: "2026-01-01", distortion_level: 20, };
    // 90 - 0.5*10 - 20 = 65
    expect(effectiveConfidence(row, 10, cfg,),).toBeCloseTo(65,);
  });

  test("clamps to 0 floor (heavy decay)", () => {
    const row: LifecycleRow = { confidence: 30, last_verified: "2026-01-01", distortion_level: 80, };
    // 30 - 0.5*100 - 80 = -100 -> clamped to 0
    expect(effectiveConfidence(row, 100, cfg,),).toBe(0,);
  });

  test("clamps confidence above 100 (legacy bad data)", () => {
    const row: LifecycleRow = { confidence: 250, last_verified: null, distortion_level: 0, };
    expect(effectiveConfidence(row, 0, cfg,),).toBe(100,);
  });

  test("clamps negative distortion (legacy bad data)", () => {
    const row: LifecycleRow = { confidence: 80, last_verified: null, distortion_level: -5, };
    expect(effectiveConfidence(row, 0, cfg,),).toBe(80,);
  });

  test("NaN worldDaysSince treated as 0", () => {
    const row: LifecycleRow = { confidence: 80, last_verified: "2026-01-01", distortion_level: 0, };
    expect(effectiveConfidence(row, Number.NaN, cfg,),).toBe(80,);
  });

  test("custom decay_per_day applies", () => {
    const custom: LifecycleConfig = { ...DEFAULT_LIFECYCLE_CONFIG, decay_per_day: 5, };
    const row: LifecycleRow = { confidence: 100, last_verified: "2026-01-01", distortion_level: 0, };
    // 100 - 5 * 10 = 50
    expect(effectiveConfidence(row, 10, custom,),).toBeCloseTo(50,);
  });
});

describe("isDisputed", () => {
  test("false below the default cap (80)", () => {
    expect(isDisputed({ confidence: 100, last_verified: null, distortion_level: 79, }, cfg,),).toBe(false,);
  });

  test("true at the cap (boundary inclusive)", () => {
    expect(isDisputed({ confidence: 100, last_verified: null, distortion_level: 80, }, cfg,),).toBe(true,);
  });

  test("true above the cap", () => {
    expect(isDisputed({ confidence: 100, last_verified: null, distortion_level: 100, }, cfg,),).toBe(true,);
  });

  test("custom distortion_cap honored", () => {
    const custom: LifecycleConfig = { ...DEFAULT_LIFECYCLE_CONFIG, distortion_cap: 25, };
    expect(isDisputed({ confidence: 100, last_verified: null, distortion_level: 25, }, custom,),).toBe(true,);
    expect(isDisputed({ confidence: 100, last_verified: null, distortion_level: 24, }, custom,),).toBe(false,);
  });

  test("negative distortion clamped to 0 -> not disputed", () => {
    expect(isDisputed({ confidence: 100, last_verified: null, distortion_level: -10, }, cfg,),).toBe(false,);
  });
});

describe("resolveLifecycleConfig", () => {
  test("null/undefined -> defaults", () => {
    expect(resolveLifecycleConfig(null,),).toEqual(DEFAULT_LIFECYCLE_CONFIG,);
    expect(resolveLifecycleConfig(undefined,),).toEqual(DEFAULT_LIFECYCLE_CONFIG,);
  });

  test("empty object -> defaults", () => {
    expect(resolveLifecycleConfig({},),).toEqual(DEFAULT_LIFECYCLE_CONFIG,);
  });

  test("absent lifecycle_config -> defaults", () => {
    expect(resolveLifecycleConfig({ other: "x", },),).toEqual(DEFAULT_LIFECYCLE_CONFIG,);
  });

  test("full override merges", () => {
    expect(
      resolveLifecycleConfig({ lifecycle_config: { min_confidence: 50, decay_per_day: 2, distortion_cap: 60, }, },),
    ).toEqual({ min_confidence: 50, decay_per_day: 2, distortion_cap: 60, },);
  });

  test("partial override merges with defaults", () => {
    expect(
      resolveLifecycleConfig({ lifecycle_config: { min_confidence: 10, }, },),
    ).toEqual({
      min_confidence: 10,
      decay_per_day: DEFAULT_LIFECYCLE_CONFIG.decay_per_day,
      distortion_cap: DEFAULT_LIFECYCLE_CONFIG.distortion_cap,
    },);
  });

  test("non-object lifecycle_config -> defaults", () => {
    expect(resolveLifecycleConfig({ lifecycle_config: "not-an-object", },),).toEqual(DEFAULT_LIFECYCLE_CONFIG,);
    expect(resolveLifecycleConfig({ lifecycle_config: 42, },),).toEqual(DEFAULT_LIFECYCLE_CONFIG,);
  });

  test("min_confidence out-of-range clamped to 0..100", () => {
    expect(
      resolveLifecycleConfig({ lifecycle_config: { min_confidence: 500, }, },).min_confidence,
    ).toBe(100,);
    expect(
      resolveLifecycleConfig({ lifecycle_config: { min_confidence: -10, }, },).min_confidence,
    ).toBe(0,);
  });

  test("negative decay_per_day falls back to default", () => {
    expect(
      resolveLifecycleConfig({ lifecycle_config: { decay_per_day: -1, }, },).decay_per_day,
    ).toBe(DEFAULT_LIFECYCLE_CONFIG.decay_per_day,);
  });

  test("non-numeric values fall back to defaults", () => {
    expect(
      resolveLifecycleConfig({ lifecycle_config: { min_confidence: "50", }, },).min_confidence,
    ).toBe(DEFAULT_LIFECYCLE_CONFIG.min_confidence,);
  });
});

describe("DEFAULT_LIFECYCLE_CONFIG", () => {
  test("is frozen (defensive)", () => {
    expect(Object.isFrozen(DEFAULT_LIFECYCLE_CONFIG,),).toBe(true,);
  });
});

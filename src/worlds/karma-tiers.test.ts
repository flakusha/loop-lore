// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pure tier/effect tests (karma-tiers.ts) - no database. The ledger and the
 * travel gate live in karma.test.ts.
 */
import { describe, expect, test, } from "bun:test";
import {
  buildStandingEffects,
  computeKarmaTier,
  computeStandingTier,
  KarmaTier,
  parseFactionStandingRequirement,
  STANDING_TIER_THRESHOLDS,
  StandingTier,
} from "./karma-tiers";

describe("tier boundaries", () => {
  test("standing tiers flip exactly at the threshold", () => {
    const bands = Object.entries(STANDING_TIER_THRESHOLDS,) as [StandingTier, number,][];
    for (const [tier, threshold,] of bands) {
      // `hostile` is the open-ended bottom band: its floor IS the clamp, so
      // it has no threshold - 1 sample to compare against.
      if (threshold > -100) {
        expect(computeStandingTier({ standing: threshold - 1, },),).not.toBe(tier,);
      }

      expect(computeStandingTier({ standing: threshold, },),).toBe(tier,);
      expect(computeStandingTier({ standing: threshold + 1, },),).toBe(tier,);
    }

    expect(computeStandingTier({ standing: 79, },),).toBe(StandingTier.Revered,);
    expect(computeStandingTier({ standing: 80, },),).toBe(StandingTier.Exalted,);
  });

  test("karma tiers split at their own floors", () => {
    expect(computeKarmaTier({ overall: 59, },),).toBe(KarmaTier.Hero,);
    expect(computeKarmaTier({ overall: 60, },),).toBe(KarmaTier.Saint,);
    expect(computeKarmaTier({ overall: -20, },),).toBe(KarmaTier.Neutral,);
    expect(computeKarmaTier({ overall: -21, },),).toBe(KarmaTier.Villain,);
  });

  test("standing effects are data only and open up as the tier rises", () => {
    const hostile = buildStandingEffects({ standing: -100, },);
    expect(hostile.tier,).toBe(StandingTier.Hostile,);
    expect(hostile.itemAccess.every((rule,) => !rule.granted),).toBe(true,);
    expect(hostile.priceModifier.buyPercent,).toBeGreaterThan(0,);

    const exalted = buildStandingEffects({ standing: 80, },);
    expect(exalted.itemAccess.every((rule,) => rule.granted),).toBe(true,);
    expect(exalted.quests.every((rule,) => rule.available),).toBe(true,);
    expect(exalted.priceModifier.sellPercent,).toBeGreaterThan(0,);
  });

  test("a price tag is read as <factionId>:<tier>", () => {
    expect(() => parseFactionStandingRequirement("no-colon",)).toThrow();
    expect(() => parseFactionStandingRequirement("fac-1:bogus",)).toThrow();
    expect(parseFactionStandingRequirement("fac-1:revered",),).toEqual({
      factionId: "fac-1",
      tier: StandingTier.Revered,
    },);
  });
});

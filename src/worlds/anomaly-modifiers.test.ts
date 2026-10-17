// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/anomaly-modifiers.test.ts — the PURE half of the anomaly engine.
 *
 * Split out of anomalies.test.ts by the size gate: `applyAnomalyModifiers` and
 * `getAnomalyForPrompt` never touch the database, so they need no fixture and
 * no teardown. Everything that does touch the DB stays in anomalies.test.ts.
 *
 * The merge rule these pin is the one a consumer cannot re-derive by reading:
 * per-second scalars and stats ADD, the two yield multipliers MULTIPLY, and
 * the caller's `baseModifiers` object is never mutated.
 */
import { describe, expect, test, } from "bun:test";
import { applyAnomalyModifiers, getAnomalyForPrompt, neutralModifiers, } from "./anomaly-modifiers";
import type { Anomaly, } from "./anomaly-types";

const NOW = new Date(Date.UTC(2026, 0, 1,),);

/** A minimal row; only the effect columns matter to these functions. */
function anomalyWith(effect: Partial<Anomaly>,): Anomaly {
  return {
    id: "a",
    location_id: "loc-1",
    world_id: "w1",
    name: "Test",
    type: "neutral",
    stat_modifiers: "{}",
    damage_over_time: 0,
    healing_over_time: 0,
    experience_multiplier: 1,
    loot_multiplier: 1,
    special_effects: "[]",
    duration_seconds: -1,
    discovery_chance: 0,
    discovered_at: null,
    interaction_required: "optional",
    expires_at: null,
    created_at: NOW.toISOString(),
    ...effect,
  };
}

describe("applyAnomalyModifiers", () => {
  test("sums stats and over-time scalars", () => {
    const merged = applyAnomalyModifiers({
      anomalies: [
        anomalyWith({ stat_modifiers: '{"strength":2}', damage_over_time: 3, },),
        anomalyWith({ stat_modifiers: '{"strength":1,"luck":-1}', damage_over_time: -1, },),
      ],
    },);

    expect(merged.stats,).toEqual({ strength: 3, luck: -1, },);
    expect(merged.damageOverTime,).toBe(2,);
  });

  test("multiplies the two yield multipliers", () => {
    const merged = applyAnomalyModifiers({
      anomalies: [
        anomalyWith({ experience_multiplier: 1.5, loot_multiplier: 2, },),
        anomalyWith({ experience_multiplier: 1.5, loot_multiplier: 3, },),
      ],
    },);

    expect(merged.experienceMultiplier,).toBeCloseTo(2.25,);
    expect(merged.lootMultiplier,).toBe(6,);
  });

  test("seeds from baseModifiers without mutating it", () => {
    const base = neutralModifiers();
    base.stats = { strength: 5, };

    const merged = applyAnomalyModifiers({
      anomalies: [anomalyWith({ stat_modifiers: '{"strength":2}', },),],
      baseModifiers: base,
    },);

    expect(merged.stats,).toEqual({ strength: 7, },);
    expect(base.stats,).toEqual({ strength: 5, },);
  });

  test("de-duplicates special effects, keeping first-seen order", () => {
    const merged = applyAnomalyModifiers({
      anomalies: [
        anomalyWith({ special_effects: '["echo","veil"]', },),
        anomalyWith({ special_effects: '["veil","thorn"]', },),
      ],
    },);

    expect(merged.specialEffects,).toEqual(["echo", "veil", "thorn",],);
  });

  test("an empty pool yields the neutral record", () => {
    const merged = applyAnomalyModifiers({ anomalies: [], },);

    expect(merged.stats,).toEqual({},);
    expect(merged.damageOverTime,).toBe(0,);
    expect(merged.experienceMultiplier,).toBe(1,);
    expect(merged.lootMultiplier,).toBe(1,);
    expect(merged.specialEffects,).toEqual([],);
  });
});

describe("getAnomalyForPrompt", () => {
  test("emits only the effects that differ from neutral", () => {
    const line = getAnomalyForPrompt(
      anomalyWith({
        name: "Weeping Stone",
        type: "negative",
        stat_modifiers: '{"luck":-2}',
        damage_over_time: 3,
        loot_multiplier: 2,
      },),
    );

    expect(line,).toBe("[negative] Weeping Stone, -2 luck, 3/s damage, loot x2",);
  });

  test("an inert anomaly yields the bare label, with no neutral filler", () => {
    expect(getAnomalyForPrompt(anomalyWith({ name: "Quiet Stone", },),),).toBe("[neutral] Quiet Stone",);
  });
});

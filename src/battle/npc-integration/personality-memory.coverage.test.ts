// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NPC personality + memory coverage — morale modifiers, surrender checks,
 * battle-memory retention and lesson generation, including boundary and
 * damaged-data cases.
 */
import { describe, expect, test, } from "bun:test";
import {
  createBattleMemory,
  shouldRememberBattle,
} from "./memory.js";
import {
  getPersonalityMoraleModifier,
  wouldNPCSurrender,
} from "./personality.js";
import type {
  NPCBattleMemory,
  NPCPersonality,
} from "./types.js";

const NEUTRAL: NPCPersonality = {
  aggression: 50,
  caution: 50,
  loyalty: 50,
  intelligence: 50,
  courage: 50,
};

/**
 * @param overrides
 */
function personality(overrides: Partial<NPCPersonality>,): NPCPersonality {
  return { ...NEUTRAL, ...overrides, };
}

/**
 * @param outcome
 * @param impact
 */
function memory(outcome: NPCBattleMemory["outcome"], impact: number,): NPCBattleMemory {
  return {
    battleId: "b1",
    timestamp: new Date().toISOString(),
    outcome,
    opponents: ["opp-1",],
    lessons: [],
    emotionalImpact: impact,
  };
}

describe("getPersonalityMoraleModifier", () => {
  test("neutral personality yields zero", () => {
    expect(getPersonalityMoraleModifier(NEUTRAL,),).toBe(0,);
  });

  test("brave loyal commander hits the +20 clamp", () => {
    const m = getPersonalityMoraleModifier(personality({ courage: 100, loyalty: 100, caution: 0, }),);
    expect(m,).toBe(20,);
  });

  test("cowardly disloyal worrier hits the -20 clamp", () => {
    const m = getPersonalityMoraleModifier(personality({ courage: 0, loyalty: 0, caution: 100, }),);
    expect(m,).toBe(-20,);
  });

  test("extreme values stay clamped, never beyond ±20", () => {
    const m = getPersonalityMoraleModifier(personality({ courage: 100, loyalty: 100, caution: 0, }),);
    expect(m,).toBeLessThanOrEqual(20,);
    expect(m,).toBeGreaterThanOrEqual(-20,);
  });

  test("caution drags morale down when outnumbered-minded", () => {
    const calm = getPersonalityMoraleModifier(personality({ caution: 0, }),);
    const wary = getPersonalityMoraleModifier(personality({ caution: 100, }),);
    expect(wary,).toBeLessThan(calm,);
  });
});

describe("wouldNPCSurrender", () => {
  test("courage above 80 never surrenders (deterministic)", () => {
    for (const hp of [1, 10, 50, 100,]) {
      const r = wouldNPCSurrender(personality({ courage: 81, }), hp, 100, [],);
      expect(r.surrender,).toBe(false,);
      expect(r.confidence,).toBe(90,);
    }
  });

  test("full-health average NPC has zero surrender chance", () => {
    const r = wouldNPCSurrender(NEUTRAL, 100, 100, [],);
    expect(r.confidence,).toBe(0,);
    expect(r.surrender,).toBe(false,);
  });

  test("health bands raise confidence deterministically", () => {
    const low = wouldNPCSurrender(NEUTRAL, 10, 100, [],);
    const mid = wouldNPCSurrender(NEUTRAL, 30, 100, [],);
    const high = wouldNPCSurrender(NEUTRAL, 50, 100, [],);
    expect(low.confidence,).toBe(40,);
    expect(mid.confidence,).toBe(20,);
    expect(high.confidence,).toBe(10,);
  });

  test("boundary health percentages pick the lower band", () => {
    // Exactly 20% is NOT < 20, so it falls into the < 40 band.
    expect(wouldNPCSurrender(NEUTRAL, 20, 100, [],).confidence,).toBe(20,);
    expect(wouldNPCSurrender(NEUTRAL, 40, 100, [],).confidence,).toBe(10,);
    expect(wouldNPCSurrender(NEUTRAL, 60, 100, [],).confidence,).toBe(0,);
  });

  test("recent defeats accumulate and the chance caps at 95", () => {
    const defeats = [
      memory("defeat", -30,),
      memory("defeat", -30,),
      memory("defeat", -30,),
      memory("defeat", -30,),
      memory("defeat", -30,),
      memory("defeat", -30,),
      memory("defeat", -30,),
      memory("defeat", -30,),
      memory("defeat", -30,),
      memory("defeat", -30,),
    ];
    const r = wouldNPCSurrender(personality({ courage: 0, }), 1, 100, defeats,);
    expect(r.confidence,).toBe(95,);
  });

  test("victories do not count as defeats", () => {
    const wins = [memory("victory", 20,), memory("draw", 5,),];
    const r = wouldNPCSurrender(NEUTRAL, 30, 100, wins,);
    expect(r.confidence,).toBe(20,);
  });
});

describe("shouldRememberBattle", () => {
  test("zero intelligence never remembers (deterministic)", () => {
    expect(shouldRememberBattle(personality({ intelligence: 0, }), "defeat", 99,),).toBe(false,);
    expect(shouldRememberBattle(personality({ intelligence: 0, }), "victory", 99,),).toBe(false,);
  });

  test("genius crushed by a stronger foe always remembers (deterministic)", () => {
    expect(shouldRememberBattle(personality({ intelligence: 100, }), "defeat", 20,),).toBe(true,);
  });

  test("mid-range cases return a boolean", () => {
    const r = shouldRememberBattle(NEUTRAL, "victory", 10,);
    expect(typeof r,).toBe("boolean",);
  });
});

describe("createBattleMemory", () => {
  test("victory scales with level advantage", () => {
    const m = createBattleMemory("b1", "victory", ["o1",], 8, 10,);
    expect(m.emotionalImpact,).toBe(24,);
    expect(m.lessons,).toEqual(["Won the battle",],);
  });

  test("crushing a weaker foe adds a lesson", () => {
    const m = createBattleMemory("b1", "victory", ["o1",], 10, 20,);
    expect(m.emotionalImpact,).toBe(40,);
    expect(m.lessons,).toContain("Opponent was weaker than expected",);
  });

  test("defeat against stronger group stacks lessons", () => {
    const m = createBattleMemory("b1", "defeat", ["o1", "o2",], 15, 5,);
    expect(m.emotionalImpact,).toBe(-60,);
    expect(m.lessons,).toEqual([
      "Learned from defeat",
      "Opponent was much stronger",
      "Faced multiple opponents",
    ],);
  });

  test("draw has mild impact", () => {
    const m = createBattleMemory("b1", "draw", ["o1",], 8, 10,);
    expect(m.emotionalImpact,).toBe(7,);
    expect(m.lessons,).toEqual([],);
  });

  test("impact clamps to ±100 on absurd level gaps", () => {
    expect(createBattleMemory("b1", "defeat", [], 100, 1,).emotionalImpact,).toBe(-100,);
    expect(createBattleMemory("b1", "victory", [], 1, 100,).emotionalImpact,).toBe(100,);
  });

  test("preserves identity fields and a parseable timestamp", () => {
    const m = createBattleMemory("battle-9", "draw", ["x", "y",], 5, 5,);
    expect(m.battleId,).toBe("battle-9",);
    expect(m.opponents,).toEqual(["x", "y",],);
    expect(m.outcome,).toBe("draw",);
    expect(Number.isNaN(Date.parse(m.timestamp,),),).toBe(false,);
  });
});

import { describe, expect, it, } from "bun:test";
import { isCombatOver, isDead, isIncapacitated, } from "./conditions";
import type { Combatant, } from "./types.js";

/** Minimal combatant — readers under test only touch conditions/hp/isNpc. */
function makeCombatant(overrides?: { conditions?: string[]; hp?: number; isNpc?: boolean },): Combatant {
  return {
    id: "c1",
    name: "Test",
    hp: overrides?.hp ?? 10,
    maxHp: 10,
    ac: 10,
    stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, },
    level: 1,
    isNpc: overrides?.isNpc ?? false,
    initiative: 0,
    initiativeMod: 0,
    hasActed: false,
    actions: 1,
    bonusActions: 0,
    reactions: 1,
    conditions: overrides?.conditions ?? [],
  };
}

describe("rpg/combat/conditions (real logic)", () => {
  it("isIncapacitated detects stunned/paralyzed", () => {
    expect(isIncapacitated(makeCombatant({ conditions: ["stunned",], hp: 10, isNpc: false, },),),).toBe(true,);
    expect(isIncapacitated(makeCombatant({ conditions: [], hp: 10, isNpc: false, },),),).toBe(false,);
  });
  it("isDead detects 0 or negative HP", () => {
    expect(isDead(makeCombatant({ conditions: [], hp: 0, isNpc: true, },),),).toBe(true,);
    expect(isDead(makeCombatant({ conditions: [], hp: -5, isNpc: false, },),),).toBe(true,);
    expect(isDead(makeCombatant({ conditions: [], hp: 10, isNpc: true, },),),).toBe(false,);
  });
  it("isCombatOver detects defeat", () => {
    const result = isCombatOver([
      makeCombatant({ conditions: [], hp: 0, isNpc: false, },),
      makeCombatant({ conditions: [], hp: 10, isNpc: true, },),
    ],);
    expect(result.over,).toBe(true,);
    expect(result.winner,).toBe("enemy",);
  });
  it("isCombatOver not over when both sides alive", () => {
    const result = isCombatOver([
      makeCombatant({ conditions: [], hp: 10, isNpc: false, },),
      makeCombatant({ conditions: [], hp: 10, isNpc: true, },),
    ],);
    expect(result.over,).toBe(false,);
  });
});

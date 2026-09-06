/**
 * RPG Combat Actions and Conditions Tests
 *
 * Pins action economy, condition gates, and damage bounds.
 */
import { describe, expect, it, } from "bun:test";
import { type StatBlock, } from "../stats/types.js";
import {
  canTakeAction,
  consumeAction,
  initCombatant,
  resetTurnActions,
} from "./actions.js";
import {
  isCombatOver,
  isDead,
  isIncapacitated,
} from "./conditions.js";
import { applyDamage, healCombatant, } from "./damage.js";
import { ActionType, type Combatant, } from "./types.js";

const STATS: StatBlock = { str: 14, dex: 14, con: 12, int: 10, wis: 10, cha: 8, };

function makeCombatant(overrides: Partial<Combatant> = {},): Combatant {
  return {
    ...initCombatant("c1", "Fighter", STATS, 3, 24, 15, false,),
    ...overrides,
  };
}

describe("initCombatant", () => {
  it("starts fresh with full action economy", () => {
    const c = makeCombatant();
    expect(c.maxHp,).toBe(24,);
    expect(c.actions,).toBe(1,);
    expect(c.bonusActions,).toBe(1,);
    expect(c.hasActed,).toBe(false,);
    expect(c.conditions,).toEqual([],);
  });
});

describe("canTakeAction", () => {
  it("denies everything while stunned or paralyzed", () => {
    expect(canTakeAction(makeCombatant({ conditions: ["stunned",], },), ActionType.Attack,),).toBe(false,);
    expect(canTakeAction(makeCombatant({ conditions: ["paralyzed",], },), ActionType.FreeAction,),).toBe(false,);
  });
  it("spends from the matching pool", () => {
    const c = makeCombatant();
    expect(canTakeAction(c, ActionType.Attack,),).toBe(true,);
    expect(canTakeAction(c, ActionType.FreeAction,),).toBe(true,);
    expect(canTakeAction(makeCombatant({ reactions: 0, },), ActionType.Reaction,),).toBe(false,);
  });
});

describe("consumeAction", () => {
  it("marks acted and drains the pool without going negative", () => {
    const after = consumeAction(makeCombatant(), ActionType.Attack,);
    expect(after.hasActed,).toBe(true,);
    expect(after.actions,).toBe(0,);
    const twice = consumeAction(after, ActionType.Attack,);
    expect(twice.actions,).toBe(0,);
  });
  it("leaves other pools untouched", () => {
    const after = consumeAction(makeCombatant(), ActionType.BonusAction,);
    expect(after.bonusActions,).toBe(0,);
    expect(after.actions,).toBe(1,);
    expect(after.hasActed,).toBe(false,);
  });
});

describe("resetTurnActions", () => {
  it("restores the turn economy", () => {
    const spent = consumeAction(makeCombatant(), ActionType.Attack,);
    const fresh = resetTurnActions(spent,);
    expect(fresh.actions,).toBe(1,);
    expect(fresh.hasActed,).toBe(false,);
  });
});

describe("isIncapacitated", () => {
  it("matches hard-lock conditions only", () => {
    expect(isIncapacitated(makeCombatant({ conditions: ["unconscious",], },),),).toBe(true,);
    expect(isIncapacitated(makeCombatant({ conditions: ["poisoned",], },),),).toBe(false,);
    expect(isIncapacitated(makeCombatant(),),).toBe(false,);
  });
});

describe("isDead", () => {
  it("is true at zero HP", () => {
    expect(isDead(makeCombatant({ hp: 0, },),),).toBe(true,);
    expect(isDead(makeCombatant(),),).toBe(false,);
  });
});

describe("isCombatOver", () => {
  it("declares the surviving side winner", () => {
    const hero = makeCombatant();
    const deadFoe = makeCombatant({ id: "e1", isNpc: true, hp: 0, },);
    expect(isCombatOver([hero, deadFoe,],),).toEqual({ over: true, winner: "player", },);
  });
  it("stays live while both sides stand", () => {
    const hero = makeCombatant();
    const foe = makeCombatant({ id: "e1", isNpc: true, },);
    expect(isCombatOver([hero, foe,],),).toEqual({ over: false, winner: null, },);
  });
});

describe("applyDamage", () => {
  it("reduces HP and reports overkill on defeat", () => {
    const { updated, overkill, defeated, } = applyDamage(makeCombatant(), 30,);
    expect(updated.hp,).toBe(0,);
    expect(overkill,).toBe(6,);
    expect(defeated,).toBe(true,);
  });
  it("leaves survivors standing", () => {
    const { updated, defeated, } = applyDamage(makeCombatant(), 5,);
    expect(updated.hp,).toBe(19,);
    expect(defeated,).toBe(false,);
  });
});

describe("healCombatant", () => {
  it("clamps at max HP", () => {
    const hurt = makeCombatant({ hp: 20, },);
    expect(healCombatant(hurt, 10,).hp,).toBe(24,);
    expect(healCombatant(hurt, 2,).hp,).toBe(22,);
  });
});

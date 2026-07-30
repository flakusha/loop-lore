/**
 * RPG Combat Engine Tests
 *
 * Tests initiative, attack rolls, damage calculation, action economy,
 * and combat state management.
 */
import { describe, expect, it, } from "bun:test";
import {
  applyDamage,
  canTakeAction,
  type Combatant,
  consumeAction,
  type DamageResistance,
  healCombatant,
  initCombatant,
  isCombatOver,
  isDead,
  isIncapacitated,
  makeAttackRoll,
  makeSavingThrow,
  resetRoundReactions,
  resetTurnActions,
  rollInitiative,
  sortByInitiative,
} from "./combat.js";
import type { StatBlock, } from "./stats.js";

const testStats: StatBlock = { str: 16, dex: 14, con: 12, int: 10, wis: 8, cha: 6, };

function makeTestCombatant(overrides: Partial<Combatant> = {},): Combatant {
  return {
    id: "test-1",
    name: "Test Fighter",
    hp: 30,
    maxHp: 30,
    ac: 16,
    stats: testStats,
    level: 5,
    isNpc: false,
    initiative: 0,
    initiativeMod: 2,
    hasActed: false,
    actions: 1,
    bonusActions: 1,
    reactions: 1,
    conditions: [],
    ...overrides,
  };
}

describe("rollInitiative", () => {
  it("returns d20 + DEX mod", () => {
    const combatant = makeTestCombatant();
    const result = rollInitiative(combatant,);
    expect(result.dexMod,).toBe(2,);
    expect(result.total,).toBeGreaterThanOrEqual(3,); // min: 1 + 2
    expect(result.total,).toBeLessThanOrEqual(22,); // max: 20 + 2
  });

  it("roll is in [1, 20]", () => {
    for (let i = 0; i < 100; i++) {
      const result = rollInitiative(makeTestCombatant(),);
      expect(result.roll,).toBeGreaterThanOrEqual(1,);
      expect(result.roll,).toBeLessThanOrEqual(20,);
    }
  });
});

describe("sortByInitiative", () => {
  it("sorts highest initiative first", () => {
    const a = makeTestCombatant({ id: "a", initiative: 15, },);
    const b = makeTestCombatant({ id: "b", initiative: 20, },);
    const c = makeTestCombatant({ id: "c", initiative: 10, },);
    const sorted = sortByInitiative([a, b, c,],);
    expect(sorted[0]!.id,).toBe("b",);
    expect(sorted[1]!.id,).toBe("a",);
    expect(sorted[2]!.id,).toBe("c",);
  });

  it("breaks ties by DEX score", () => {
    const a = makeTestCombatant({ id: "a", initiative: 15, stats: { ...testStats, dex: 16, }, },);
    const b = makeTestCombatant({ id: "b", initiative: 15, stats: { ...testStats, dex: 14, }, },);
    const sorted = sortByInitiative([a, b,],);
    expect(sorted[0]!.id,).toBe("a",);
  });
});

describe("makeAttackRoll", () => {
  const attacker = makeTestCombatant({ id: "attacker", level: 5, },);
  const target = makeTestCombatant({ id: "target", ac: 14, },);

  it("returns hit or miss", () => {
    for (let i = 0; i < 100; i++) {
      const result = makeAttackRoll(attacker, target, "str", 2, 6,);
      expect(typeof result.hit,).toBe("boolean",);
      if (result.hit) {
        expect(result.damage,).not.toBeNull();
        expect(result.damage!.finalDamage,).toBeGreaterThanOrEqual(0,);
      } else {
        expect(result.damage,).toBeNull();
      }
    }
  });

  it("critical hit always hits and deals extra dice", () => {
    // Run until we get a crit
    let foundCrit = false;
    for (let i = 0; i < 500; i++) {
      const result = makeAttackRoll(attacker, target, "str", 2, 6,);
      if (result.criticalHit) {
        foundCrit = true;
        expect(result.hit,).toBe(true,);
        expect(result.damage,).not.toBeNull();
        expect(result.damage!.isCritical,).toBe(true,);
        // Critical doubles the dice count
        expect(result.damage!.baseDice.dice.length,).toBe(4,); // 2 * 2 = 4
        break;
      }
    }
    expect(foundCrit,).toBe(true,);
  });

  it("applies damage resistance", () => {
    const resistances: DamageResistance[] = [
      { type: "fire", modifier: "resistant", },
    ];
    // Run multiple to get at least one hit
    for (let i = 0; i < 200; i++) {
      const result = makeAttackRoll(
        attacker,
        target,
        "str",
        2,
        6,
        "fire",
        0,
        resistances,
      );
      if (result.hit && result.damage) {
        expect(result.damage.finalDamage,).toBeLessThanOrEqual(
          result.damage.totalBeforeResist,
        );
        // Resistant halves damage (rounded down)
        expect(result.damage.finalDamage,).toBe(
          Math.floor(result.damage.totalBeforeResist / 2,),
        );
        break;
      }
    }
  });

  it("applies vulnerability (double damage)", () => {
    const resistances: DamageResistance[] = [
      { type: "ice", modifier: "vulnerable", },
    ];
    for (let i = 0; i < 200; i++) {
      const result = makeAttackRoll(
        attacker,
        target,
        "str",
        2,
        6,
        "ice",
        0,
        resistances,
      );
      if (result.hit && result.damage) {
        expect(result.damage.finalDamage,).toBe(
          result.damage.totalBeforeResist * 2,
        );
        break;
      }
    }
  });

  it("applies immunity (zero damage)", () => {
    const resistances: DamageResistance[] = [
      { type: "poison", modifier: "immune", },
    ];
    for (let i = 0; i < 200; i++) {
      const result = makeAttackRoll(
        attacker,
        target,
        "str",
        2,
        6,
        "poison",
        0,
        resistances,
      );
      if (result.hit && result.damage) {
        expect(result.damage.finalDamage,).toBe(0,);
        break;
      }
    }
  });

  it("adds extra flat damage", () => {
    for (let i = 0; i < 200; i++) {
      const result = makeAttackRoll(
        attacker,
        target,
        "str",
        2,
        6,
        "physical",
        5,
      );
      if (result.hit && result.damage) {
        expect(result.damage.flatBonus,).toBe(5,);
        expect(result.damage.totalBeforeResist,).toBeGreaterThanOrEqual(5,);
        break;
      }
    }
  });
});

describe("makeSavingThrow", () => {
  const combatant = makeTestCombatant({ level: 5, },);

  it("returns success or failure", () => {
    for (let i = 0; i < 100; i++) {
      const result = makeSavingThrow(combatant, "con", 13,);
      expect(typeof result.success,).toBe("boolean",);
    }
  });

  it("total = d20 + ability mod + proficiency", () => {
    const result = makeSavingThrow(combatant, "con", 13,);
    // CON mod = 1, prof = +3 at level 5
    expect(result.total,).toBeGreaterThanOrEqual(4,); // 1 + 1 + 2 (min roll)
    expect(result.total,).toBeLessThanOrEqual(24,); // 20 + 1 + 3
  });
});

describe("initCombatant", () => {
  it("creates combatant with correct defaults", () => {
    const c = initCombatant("id-1", "Hero", testStats, 5, 30, 16, false,);
    expect(c.id,).toBe("id-1",);
    expect(c.name,).toBe("Hero",);
    expect(c.hp,).toBe(30,);
    expect(c.maxHp,).toBe(30,);
    expect(c.ac,).toBe(16,);
    expect(c.level,).toBe(5,);
    expect(c.actions,).toBe(1,);
    expect(c.bonusActions,).toBe(1,);
    expect(c.reactions,).toBe(1,);
    expect(c.conditions,).toEqual([],);
  });
});

describe("action economy", () => {
  it("canTakeAction: normal attack costs action", () => {
    const c = makeTestCombatant();
    expect(canTakeAction(c, "attack",),).toBe(true,);
    const consumed = consumeAction(c, "attack",);
    expect(canTakeAction(consumed, "attack",),).toBe(false,);
  });

  it("canTakeAction: bonus action is separate", () => {
    const c = makeTestCombatant();
    const consumed = consumeAction(c, "attack",);
    expect(canTakeAction(consumed, "bonus_action",),).toBe(true,);
  });

  it("canTakeAction: free actions always available", () => {
    const c = makeTestCombatant({ actions: 0, },);
    expect(canTakeAction(c, "free_action",),).toBe(true,);
  });

  it("canTakeAction: reactions consumed and restored per round", () => {
    const c = makeTestCombatant();
    expect(canTakeAction(c, "reaction",),).toBe(true,);
    const consumed = consumeAction(c, "reaction",);
    expect(canTakeAction(consumed, "reaction",),).toBe(false,);
    const restored = resetRoundReactions([consumed,],);
    expect(canTakeAction(restored[0]!, "reaction",),).toBe(true,);
  });

  it("canTakeAction: stunned prevents all actions", () => {
    const c = makeTestCombatant({ conditions: ["stunned",], },);
    expect(canTakeAction(c, "attack",),).toBe(false,);
    expect(canTakeAction(c, "bonus_action",),).toBe(false,);
  });

  it("resetTurnActions restores actions for new turn", () => {
    const c = makeTestCombatant({ actions: 0, bonusActions: 0, hasActed: true, },);
    const reset = resetTurnActions(c,);
    expect(reset.actions,).toBe(1,);
    expect(reset.bonusActions,).toBe(1,);
    expect(reset.hasActed,).toBe(false,);
  });
});

describe("applyDamage", () => {
  it("reduces HP", () => {
    const c = makeTestCombatant({ hp: 30, },);
    const { updated, defeated, } = applyDamage(c, 10,);
    expect(updated.hp,).toBe(20,);
    expect(defeated,).toBe(false,);
  });

  it("defeats at 0 HP", () => {
    const c = makeTestCombatant({ hp: 10, },);
    const { updated, defeated, } = applyDamage(c, 10,);
    expect(updated.hp,).toBe(0,);
    expect(defeated,).toBe(true,);
  });

  it("calculates overkill", () => {
    const c = makeTestCombatant({ hp: 5, },);
    const { overkill, } = applyDamage(c, 15,);
    expect(overkill,).toBe(10,);
  });

  it("HP never goes below 0", () => {
    const c = makeTestCombatant({ hp: 5, },);
    const { updated, } = applyDamage(c, 100,);
    expect(updated.hp,).toBe(0,);
  });
});

describe("healCombatant", () => {
  it("heals up to max HP", () => {
    const c = makeTestCombatant({ hp: 10, maxHp: 30, },);
    const healed = healCombatant(c, 50,);
    expect(healed.hp,).toBe(30,);
  });

  it("heals partial amount", () => {
    const c = makeTestCombatant({ hp: 10, maxHp: 30, },);
    const healed = healCombatant(c, 5,);
    expect(healed.hp,).toBe(15,);
  });
});

describe("condition checks", () => {
  it("isIncapacitated: stunned", () => {
    const c = makeTestCombatant({ conditions: ["stunned",], },);
    expect(isIncapacitated(c,),).toBe(true,);
  });

  it("isIncapacitated: normal", () => {
    const c = makeTestCombatant();
    expect(isIncapacitated(c,),).toBe(false,);
  });

  it("isDead: 0 HP", () => {
    expect(isDead(makeTestCombatant({ hp: 0, },),),).toBe(true,);
  });

  it("isDead: alive", () => {
    expect(isDead(makeTestCombatant({ hp: 1, },),),).toBe(false,);
  });
});

describe("isCombatOver", () => {
  it("not over when both sides alive", () => {
    const combatants = [
      makeTestCombatant({ id: "p1", isNpc: false, hp: 10, },),
      makeTestCombatant({ id: "e1", isNpc: true, hp: 10, },),
    ];
    expect(isCombatOver(combatants,).over,).toBe(false,);
  });

  it("over when all players dead", () => {
    const combatants = [
      makeTestCombatant({ id: "p1", isNpc: false, hp: 0, },),
      makeTestCombatant({ id: "e1", isNpc: true, hp: 10, },),
    ];
    const result = isCombatOver(combatants,);
    expect(result.over,).toBe(true,);
    expect(result.winner,).toBe("enemy",);
  });

  it("over when all enemies dead", () => {
    const combatants = [
      makeTestCombatant({ id: "p1", isNpc: false, hp: 10, },),
      makeTestCombatant({ id: "e1", isNpc: true, hp: 0, },),
    ];
    const result = isCombatOver(combatants,);
    expect(result.over,).toBe(true,);
    expect(result.winner,).toBe("player",);
  });
});

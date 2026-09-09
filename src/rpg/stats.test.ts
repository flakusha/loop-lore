/**
 * RPG Stats System Tests
 *
 * Tests ability modifiers, stat generation methods, validation,
 * and proficiency bonus.
 */
import { describe, expect, it, } from "bun:test";
import {
  ABILITY_DISPLAY,
  abilityModifier,
  ALL_ABILITIES,
  computeCharacterState,
  computeModifiers,
  defaultStatBlock,
  getModifier,
  pointBuy,
  proficiencyBonus,
  rollStats4d6,
  SKILL_ABILITY,
  standardArray,
  statBlockFromArray,
  validateStatBlock,
} from "./stats.js";

describe("abilityModifier", () => {
  it("returns 0 for stat 10", () => {
    expect(abilityModifier(10,),).toBe(0,);
  });

  it("returns +1 for stat 12", () => {
    expect(abilityModifier(12,),).toBe(1,);
  });

  it("returns -1 for stat 8", () => {
    expect(abilityModifier(8,),).toBe(-1,);
  });

  it("returns +5 for stat 20", () => {
    expect(abilityModifier(20,),).toBe(5,);
  });

  it("returns -5 for stat 0 (edge case)", () => {
    expect(abilityModifier(0,),).toBe(-5,);
  });

  it("handles odd stats correctly (floor division)", () => {
    expect(abilityModifier(11,),).toBe(0,); // floor(1/2) = 0
    expect(abilityModifier(13,),).toBe(1,); // floor(3/2) = 1
    expect(abilityModifier(9,),).toBe(-1,); // floor(-1/2) = -1
    expect(abilityModifier(7,),).toBe(-2,); // floor(-3/2) = -2
  });
});

describe("computeModifiers", () => {
  it("computes all six modifiers", () => {
    const stats = { str: 16, dex: 14, con: 12, int: 10, wis: 8, cha: 6, };
    const mods = computeModifiers(stats,);
    expect(mods.strMod,).toBe(3,);
    expect(mods.dexMod,).toBe(2,);
    expect(mods.conMod,).toBe(1,);
    expect(mods.intMod,).toBe(0,);
    expect(mods.wisMod,).toBe(-1,);
    expect(mods.chaMod,).toBe(-2,);
  });

  it("preserves original stat values", () => {
    const stats = defaultStatBlock();
    const mods = computeModifiers(stats,);
    expect(mods.str,).toBe(10,);
    expect(mods.dex,).toBe(10,);
  });
});

describe("getModifier", () => {
  it("returns modifier for specific ability", () => {
    const stats = { str: 16, dex: 14, con: 12, int: 10, wis: 8, cha: 6, };
    expect(getModifier(stats, "str",),).toBe(3,);
    expect(getModifier(stats, "cha",),).toBe(-2,);
  });
});

describe("defaultStatBlock", () => {
  it("all stats at 10", () => {
    const stats = defaultStatBlock();
    for (const ability of ALL_ABILITIES) {
      expect(stats[ability],).toBe(10,);
    }
  });
});

describe("pointBuy", () => {
  it("valid allocation returns stat block", () => {
    // Standard 27-point buy: 15/14/13/12/10/8
    const allocation = {
      str: 7,
      dex: 6,
      con: 5,
      int: 4,
      wis: 2,
      cha: 0,
    };
    const stats = pointBuy(allocation,);
    expect(stats,).not.toBeNull();
    expect(stats!.str,).toBe(15,);
    expect(stats!.dex,).toBe(14,);
    expect(stats!.con,).toBe(13,);
    expect(stats!.int,).toBe(12,);
    expect(stats!.wis,).toBe(10,);
    expect(stats!.cha,).toBe(8,);
  });

  it("returns null for invalid total (not 27)", () => {
    const allocation = {
      str: 0,
      dex: 0,
      con: 0,
      int: 0,
      wis: 0,
      cha: 0,
    };
    expect(pointBuy(allocation,),).toBeNull();
  });

  it("returns null for stat above 15", () => {
    const allocation = {
      str: 8,
      dex: 6,
      con: 5,
      int: 4,
      wis: 2,
      cha: 0,
    };
    expect(pointBuy(allocation,),).toBeNull();
  });

  it("returns null for stat below 0", () => {
    const allocation = {
      str: -1,
      dex: 0,
      con: 0,
      int: 0,
      wis: 0,
      cha: 0,
    };
    expect(pointBuy(allocation,),).toBeNull();
  });
});

describe("rollStats4d6", () => {
  it("returns 6 values", () => {
    const stats = rollStats4d6();
    expect(stats.length,).toBe(6,);
  });

  it("all values in [3, 18] range", () => {
    for (let i = 0; i < 100; i++) {
      const stats = rollStats4d6();
      for (const v of stats) {
        expect(v,).toBeGreaterThanOrEqual(3,);
        expect(v,).toBeLessThanOrEqual(18,);
      }
    }
  });

  it("returns sorted highest to lowest", () => {
    const stats = rollStats4d6();
    for (let i = 0; i < stats.length - 1; i++) {
      expect(stats[i]!,).toBeGreaterThanOrEqual(stats[i + 1]!,);
    }
  });

  it("average is around 12-13", () => {
    const allStats: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const stats = rollStats4d6();
      allStats.push(...stats,);
    }
    const avg = allStats.reduce((a, b,) => a + b, 0,) / allStats.length;
    expect(avg,).toBeGreaterThan(11,);
    expect(avg,).toBeLessThan(14,);
  });
});

describe("standardArray", () => {
  it("returns standard values", () => {
    const arr = standardArray();
    expect(arr,).toEqual([15, 14, 13, 12, 10, 8,],);
  });
});

describe("statBlockFromArray", () => {
  it("assigns values to abilities in order", () => {
    const stats = statBlockFromArray([16, 14, 12, 10, 8, 6,],);
    expect(stats.str,).toBe(16,);
    expect(stats.dex,).toBe(14,);
    expect(stats.con,).toBe(12,);
    expect(stats.int,).toBe(10,);
    expect(stats.wis,).toBe(8,);
    expect(stats.cha,).toBe(6,);
  });

  it("defaults missing values to 10", () => {
    const stats = statBlockFromArray([16,],);
    expect(stats.str,).toBe(16,);
    expect(stats.dex,).toBe(10,);
  });
});

describe("validateStatBlock", () => {
  it("accepts valid stats", () => {
    expect(validateStatBlock(defaultStatBlock(),),).toBe(true,);
  });

  it("rejects stat below 1", () => {
    expect(validateStatBlock({ str: 0, dex: 10, con: 10, int: 10, wis: 10, cha: 10, },),).toBe(false,);
  });

  it("rejects stat above 30", () => {
    expect(validateStatBlock({ str: 31, dex: 10, con: 10, int: 10, wis: 10, cha: 10, },),).toBe(false,);
  });
});

describe("proficiencyBonus", () => {
  it("level 1 = +2", () => {
    expect(proficiencyBonus(1,),).toBe(2,);
  });

  it("level 5 = +3", () => {
    expect(proficiencyBonus(5,),).toBe(3,);
  });

  it("level 17 = +6", () => {
    expect(proficiencyBonus(17,),).toBe(6,);
  });

  it("caps at level 20", () => {
    expect(proficiencyBonus(20,),).toBe(6,);
    expect(proficiencyBonus(99,),).toBe(6,);
  });

  it("floors at level 1", () => {
    expect(proficiencyBonus(0,),).toBe(2,);
    expect(proficiencyBonus(-5,),).toBe(2,);
  });
});

describe("constants", () => {
  it("ALL_ABILITIES has 6 entries", () => {
    expect(ALL_ABILITIES.length,).toBe(6,);
  });

  it("ABILITY_DISPLAY has all 6 abilities", () => {
    for (const ability of ALL_ABILITIES) {
      expect(ABILITY_DISPLAY[ability],).toBeDefined();
    }
  });

  it("SKILL_ABILITY maps all 18 skills", () => {
    const skills = Object.keys(SKILL_ABILITY,);
    expect(skills.length,).toBe(18,);
  });
});

describe("computeCharacterState", () => {
  it("returns 'active' when hp >= maxHp / 2", () => {
    expect(computeCharacterState(12, 12,),).toBe("active",);
    expect(computeCharacterState(6, 12,),).toBe("active",);
  });

  it("returns 'injured' when hp < maxHp / 2 but > 0", () => {
    expect(computeCharacterState(5, 12,),).toBe("injured",);
    expect(computeCharacterState(1, 12,),).toBe("injured",);
  });

  it("returns 'unconscious' when hp <= 0 but > -maxHp", () => {
    expect(computeCharacterState(0, 12,),).toBe("unconscious",);
    expect(computeCharacterState(-5, 12,),).toBe("unconscious",);
    expect(computeCharacterState(-11, 12,),).toBe("unconscious",);
  });

  it("returns 'dead' when hp <= -maxHp", () => {
    expect(computeCharacterState(-12, 12,),).toBe("dead",);
    expect(computeCharacterState(-20, 12,),).toBe("dead",);
  });

  it("handles edge case: maxHp of 1", () => {
    expect(computeCharacterState(1, 1,),).toBe("active",);
    expect(computeCharacterState(0, 1,),).toBe("unconscious",);
    expect(computeCharacterState(-1, 1,),).toBe("dead",);
  });
});

/**
 * RPG Dice Engine Tests
 *
 * Tests crypto-grade entropy, advantage/disadvantage, notation parsing,
 * exploding dice, and statistical distribution.
 */
import { describe, expect, it, } from "bun:test";
import {
  rollDie,
  rollMultiple,
  rollD20WithAdvantage,
  rollDice,
  parseDiceNotation,
  rollFromNotation,
} from "./dice.js";

describe("rollDie", () => {
  it("returns values in [1, sides]", () => {
    for (let i = 0; i < 1000; i++) {
      const value = rollDie(20,);
      expect(value).toBeGreaterThanOrEqual(1,);
      expect(value).toBeLessThanOrEqual(20,);
    }
  });

  it("works for all standard die types", () => {
    const sides = [4, 6, 8, 10, 12, 20, 100,] as const;
    for (const s of sides) {
      for (let i = 0; i < 100; i++) {
        const value = rollDie(s,);
        expect(value).toBeGreaterThanOrEqual(1,);
        expect(value).toBeLessThanOrEqual(s,);
      }
    }
  });
});

describe("rollMultiple", () => {
  it("returns correct count", () => {
    const results = rollMultiple(5, 6,);
    expect(results.length).toBe(5,);
  });

  it("all values in range", () => {
    for (let i = 0; i < 100; i++) {
      const results = rollMultiple(3, 20,);
      for (const v of results) {
        expect(v).toBeGreaterThanOrEqual(1,);
        expect(v).toBeLessThanOrEqual(20,);
      }
    }
  });
});

describe("rollD20WithAdvantage", () => {
  it("normal mode returns one roll", () => {
    const result = rollD20WithAdvantage("normal",);
    expect(result.rawRolls.length).toBe(1,);
    expect(result.advantageMode).toBe("normal",);
  });

  it("advantage mode returns two rolls and keeps higher", () => {
    for (let i = 0; i < 100; i++) {
      const result = rollD20WithAdvantage("advantage",);
      expect(result.rawRolls.length).toBe(2,);
      const kept = Math.max(result.rawRolls[0]!, result.rawRolls[1]!,);
      expect(result.value).toBe(kept,);
    }
  });

  it("disadvantage mode returns two rolls and keeps lower", () => {
    for (let i = 0; i < 100; i++) {
      const result = rollD20WithAdvantage("disadvantage",);
      expect(result.rawRolls.length).toBe(2,);
      const kept = Math.min(result.rawRolls[0]!, result.rawRolls[1]!,);
      expect(result.value).toBe(kept,);
    }
  });

  it("detects natural 20 on kept die", () => {
    // Statistically will find at least one in 1000 rolls
    let foundNat20 = false;
    for (let i = 0; i < 1000; i++) {
      const result = rollD20WithAdvantage("advantage",);
      if (result.natural20) {
        foundNat20 = true;
        break;
      }
    }
    expect(foundNat20).toBe(true,);
  });

  it("detects natural 1 on kept die", () => {
    let foundNat1 = false;
    for (let i = 0; i < 1000; i++) {
      const result = rollD20WithAdvantage("disadvantage",);
      if (result.natural1) {
        foundNat1 = true;
        break;
      }
    }
    expect(foundNat1).toBe(true,);
  });
});

describe("rollDice", () => {
  it("rolls correct number of dice", () => {
    const result = rollDice(6, 4, 0,);
    expect(result.dice.length).toBe(4,);
    expect(result.advantageMode).toBe("normal",);
  });

  it("applies modifier to total", () => {
    const result = rollDice(20, 1, 5,);
    expect(result.total).toBe(result.rawTotal + 5,);
    expect(result.modifier).toBe(5,);
  });

  it("total is at least 1", () => {
    // Roll with large negative modifier
    const result = rollDice(4, 1, -10,);
    expect(result.total).toBeGreaterThanOrEqual(1,);
  });

  it("exploding dice add extra rolls on max", () => {
    // Run many times to eventually hit an explosion
    let foundExploded = false;
    for (let i = 0; i < 500; i++) {
      const result = rollDice(4, 1, 0, "normal", true,);
      if (result.dice.some((d,) => d.exploded,)) {
        foundExploded = true;
        expect(result.dice.length).toBeGreaterThan(1,);
        break;
      }
    }
    expect(foundExploded).toBe(true,);
  });

  it("with advantage rolls 2d20 and keeps one", () => {
    const result = rollDice(20, 1, 0, "advantage",);
    expect(result.dice.length).toBe(2,);
    expect(result.advantageMode).toBe("advantage",);
  });

  it("statistical distribution: d20 average ~10.5", () => {
    const totals: number[] = [];
    for (let i = 0; i < 10_000; i++) {
      const result = rollDice(20, 1, 0,);
      totals.push(result.rawTotal,);
    }
    const avg = totals.reduce((a, b,) => a + b, 0,) / totals.length;
    expect(avg).toBeGreaterThan(9.5,);
    expect(avg).toBeLessThan(11.5,);
  });
});

describe("parseDiceNotation", () => {
  it("parses basic notation", () => {
    const parsed = parseDiceNotation("2d6",);
    expect(parsed).not.toBeNull();
    expect(parsed!.count).toBe(2,);
    expect(parsed!.sides).toBe(6,);
    expect(parsed!.modifier).toBe(0,);
  });

  it("parses notation with modifier", () => {
    const parsed = parseDiceNotation("1d20+5",);
    expect(parsed!.count).toBe(1,);
    expect(parsed!.sides).toBe(20,);
    expect(parsed!.modifier).toBe(5,);
  });

  it("parses negative modifier", () => {
    const parsed = parseDiceNotation("4d6-2",);
    expect(parsed!.modifier).toBe(-2,);
  });

  it("parses advantage", () => {
    const parsed = parseDiceNotation("d20 adv",);
    expect(parsed!.advantage).toBe("advantage",);
  });

  it("parses disadvantage", () => {
    const parsed = parseDiceNotation("d20 dis",);
    expect(parsed!.advantage).toBe("disadvantage",);
  });

  it("returns null for invalid notation", () => {
    expect(parseDiceNotation("invalid",)).toBeNull();
    expect(parseDiceNotation("3d7",)).toBeNull();
    expect(parseDiceNotation("",)).toBeNull();
  });

  it("parses shorthand d20", () => {
    const parsed = parseDiceNotation("d20",);
    expect(parsed!.count).toBe(1,);
    expect(parsed!.sides).toBe(20,);
  });
});

describe("rollFromNotation", () => {
  it("rolls from valid notation", () => {
    const result = rollFromNotation("2d6+3",);
    expect(result).not.toBeNull();
    expect(result!.modifier).toBe(3,);
    expect(result!.dice.length).toBe(2,);
  });

  it("returns null for invalid notation", () => {
    expect(rollFromNotation("garbage",)).toBeNull();
  });
});

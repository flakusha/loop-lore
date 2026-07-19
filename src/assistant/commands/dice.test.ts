import { beforeAll, describe, expect, test } from "bun:test";
import { createLogger } from "../../logger";
import { formatDiceResult, handleRollCommand, parseDiceNotation, rollDice, rollDie } from "./dice";

beforeAll(() => {
  createLogger({ level: "error" });
});

describe("dice", () => {
  describe("parseDiceNotation", () => {
    test("parses 2d6+3", () => {
      const result = parseDiceNotation("2d6+3");
      expect(result).toEqual({ count: 2, sides: 6, modifier: 3, notation: "2d6+3" });
    });

    test("parses d20", () => {
      const result = parseDiceNotation("d20");
      expect(result).toEqual({ count: 1, sides: 20, modifier: 0, notation: "d20" });
    });

    test("parses 4d6-2", () => {
      const result = parseDiceNotation("4d6-2");
      expect(result).toEqual({ count: 4, sides: 6, modifier: -2, notation: "4d6-2" });
    });

    test("parses 1d100", () => {
      const result = parseDiceNotation("1d100");
      expect(result).toEqual({ count: 1, sides: 100, modifier: 0, notation: "1d100" });
    });

    test("returns null for invalid notation", () => {
      expect(parseDiceNotation("hello")).toBeNull();
      expect(parseDiceNotation("2d")).toBeNull();
      expect(parseDiceNotation("d")).toBeNull();
      expect(parseDiceNotation("2d6+")).toBeNull();
    });

    test("rejects excessive counts", () => {
      expect(parseDiceNotation("101d6")).toBeNull();
    });

    test("rejects excessive sides", () => {
      expect(parseDiceNotation("d1001")).toBeNull();
    });

    test("handles leading zeros", () => {
      const result = parseDiceNotation("02d06");
      expect(result).toEqual({ count: 2, sides: 6, modifier: 0, notation: "02d06" });
    });
  });

  describe("rollDie", () => {
    test("returns value between 1 and sides", () => {
      for (let i = 0; i < 100; i++) {
        const value = rollDie(6);
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(6);
      }
    });
  });

  describe("rollDice", () => {
    test("rolls 1d20", () => {
      const result = rollDice("d20");
      expect(result).not.toBeNull();
      expect(result!.count).toBe(1);
      expect(result!.sides).toBe(20);
      expect(result!.modifier).toBe(0);
      expect(result!.rolls).toHaveLength(1);
      expect(result!.rolls[0]!.value).toBeGreaterThanOrEqual(1);
      expect(result!.rolls[0]!.value).toBeLessThanOrEqual(20);
      expect(result!.total).toBe(result!.rolls[0]!.value);
    });

    test("rolls 2d6+3", () => {
      const result = rollDice("2d6+3");
      expect(result).not.toBeNull();
      expect(result!.count).toBe(2);
      expect(result!.sides).toBe(6);
      expect(result!.modifier).toBe(3);
      expect(result!.rolls).toHaveLength(2);
      const rollSum = result!.rolls[0]!.value + result!.rolls[1]!.value;
      expect(result!.total).toBe(rollSum + 3);
    });

    test("returns null for invalid notation", () => {
      expect(rollDice("invalid")).toBeNull();
    });
  });

  describe("formatDiceResult", () => {
    test("formats result with modifier", () => {
      const result = rollDice("2d6+3")!;
      const formatted = formatDiceResult(result);
      expect(formatted).toContain("🎲");
      expect(formatted).toContain("2d6");
      expect(formatted).toContain("3");
      expect(formatted).toContain("**");
    });

    test("formats result without modifier", () => {
      const result = rollDice("d20")!;
      const formatted = formatDiceResult(result);
      expect(formatted).toContain("🎲");
      expect(formatted).toContain("1d20");
    });

    test("formats result with negative modifier", () => {
      const result = rollDice("4d6-2")!;
      const formatted = formatDiceResult(result);
      expect(formatted).toContain("4d6");
      expect(formatted).toContain("- 2");
    });
  });

  describe("handleRollCommand", () => {
    test("returns usage when no args", () => {
      const result = handleRollCommand([]);
      expect(result).toContain("Usage");
      expect(result).toContain("/roll");
    });

    test("returns error for invalid notation", () => {
      const result = handleRollCommand(["invalid"]);
      expect(result).toContain("Invalid dice notation");
    });

    test("returns formatted result for valid notation", () => {
      const result = handleRollCommand(["2d6+3"]);
      expect(result).toContain("🎲");
      expect(result).toContain("**");
    });
  });
});

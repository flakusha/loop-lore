/**
 * Dice engine tests
 *
 * Covers: parseDiceNotation, rollDice, rollExpression, parseTextCommand, isRollCommand
 */

import { describe, test, expect } from "bun:test";
import {
  parseDiceNotation,
  rollDice,
  rollExpression,
  parseTextCommand,
  isRollCommand,
} from "./engine";
import type { DiceRollResult, DiceError, DiceParseResult } from "./types";

// ── parseDiceNotation ─────────────────────────────────────────

describe("parseDiceNotation", () => {
  test("parses standard notation", () => {
    expect(parseDiceNotation("2d6+3")).toEqual({ count: 2, sides: 6, modifier: 3 });
  });

  test("parses without modifier", () => {
    expect(parseDiceNotation("1d20")).toEqual({ count: 1, sides: 20, modifier: 0 });
  });

  test("parses implicit count (d20 = 1d20)", () => {
    expect(parseDiceNotation("d20")).toEqual({ count: 1, sides: 20, modifier: 0 });
  });

  test("parses negative modifier", () => {
    expect(parseDiceNotation("3d8-2")).toEqual({ count: 3, sides: 8, modifier: -2 });
  });

  test("parses with leading zeros", () => {
    expect(parseDiceNotation("01d6")).toEqual({ count: 1, sides: 6, modifier: 0 });
  });

  test("throws on empty string", () => {
    expect(() => parseDiceNotation("")).toThrow("Empty");
  });

  test("throws on whitespace only", () => {
    expect(() => parseDiceNotation(' '.repeat(3))).toThrow("Empty");
  });

  test("throws on missing d", () => {
    expect(() => parseDiceNotation("2x6")).toThrow("Invalid");
  });

  test("throws on count zero", () => {
    expect(() => parseDiceNotation("0d6")).toThrow("Dice count");
  });

  test("throws on count > MAX", () => {
    expect(() => parseDiceNotation("101d6")).toThrow("Dice count");
  });

  test("throws on sides less than MIN", () => {
    expect(() => parseDiceNotation("1d1")).toThrow("Sides per die");
  });

  test("throws on sides > MAX", () => {
    expect(() => parseDiceNotation("1d10001")).toThrow("Sides per die");
  });

  test("throws on modifier out of range", () => {
    expect(() => parseDiceNotation("1d6+10001")).toThrow("Modifier");
  });

  test("throws on double operators", () => {
    expect(() => parseDiceNotation("1d6+-3")).toThrow("Invalid");
  });

  test("is case-insensitive", () => {
    expect(parseDiceNotation("2D6+3")).toEqual({ count: 2, sides: 6, modifier: 3 });
  });
});

// ── rollDice ──────────────────────────────────────────────────

describe("rollDice", () => {
  test("returns DiceRollResult for valid input", () => {
    const result = rollDice("2d6+3") as DiceRollResult;
    expect((result).rolls).toHaveLength(2);
    expect(result.sides).toBe(6);
    expect(result.modifier).toBe(3);
    expect(result.total).toBe(result.rolls[0] + result.rolls[1] + 3);
    expect(result.breakdown).toContain("= ");
  });

  test("rolls are in valid range", () => {
    const result = rollDice("100d100") as DiceRollResult;
    for (const roll of result.rolls) {
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(100);
    }
  });

  test("rolls have correct count", () => {
    const result = rollDice("10d6") as DiceRollResult;
    expect(result.rolls).toHaveLength(10);
  });

  test("total equals sum + modifier", () => {
    const result = rollDice("3d8+5") as DiceRollResult;
    const sum = result.rolls.reduce((a, b) => a + b, 0);
    expect(result.total).toBe(sum + 5);
  });

  test("negative modifier works", () => {
    const result = rollDice("1d20-2") as DiceRollResult;
    expect(result.modifier).toBe(-2);
    expect(result.total).toBe(result.rolls[0] - 2);
  });

  test("zero modifier excluded from breakdown", () => {
    const result = rollDice("1d20") as DiceRollResult;
    expect(result.breakdown).not.toContain("+ 0");
    expect(result.breakdown).toContain("= ");
  });

  test("returns DiceError for invalid input", () => {
    const result = rollDice("bad");
    expect((result as DiceError).error).toBeTruthy();
    expect((result as DiceError).expression).toBe("bad");
  });

  test("returns DiceError for empty", () => {
    const result = rollDice("");
    expect((result as DiceError).error).toBeTruthy();
  });

  test("d20 shorthand works", () => {
    const result = rollDice("d20") as DiceRollResult;
    expect(result.rolls).toHaveLength(1);
    expect(result.sides).toBe(20);
  });
});

// ── rollExpression ────────────────────────────────────────────

describe("rollExpression", () => {
  test("rolls with given parameters", () => {
    const result = rollExpression(2, 10, 2);
    expect(result.rolls).toHaveLength(2);
    expect(result.sides).toBe(10);
    expect(result.modifier).toBe(2);
  });

  test("rolls without modifier", () => {
    const result = rollExpression(1, 20);
    expect(result.modifier).toBe(0);
  });

  test("zero modifier excluded", () => {
    const result = rollExpression(1, 6);
    expect(result.breakdown).not.toContain("+ 0");
  });
});

// ── parseTextCommand ──────────────────────────────────────────

describe("parseTextCommand", () => {
  test("matches /roll command", () => {
    const result = parseTextCommand("/roll 2d6+3");
    expect(result.matched).toBe(true);
    expect(result.expression).toBe("2d6+3");
    expect(result.fullMatch).toBe("/roll 2d6+3");
  });

  test("matches /roll without modifier", () => {
    const result = parseTextCommand("/roll d20");
    expect(result.matched).toBe(true);
    expect(result.expression).toBe("d20");
  });

  test("matches case-insensitive", () => {
    const result = parseTextCommand("/ROLL 2d6");
    expect(result.matched).toBe(true);
  });

  test("does not match plain text", () => {
    const result = parseTextCommand("hello world");
    expect(result.matched).toBe(false);
  });

  test("does not match /roll without expression", () => {
    const result = parseTextCommand("/roll");
    expect(result.matched).toBe(false);
  });

  test("does not match partial command mid-text", () => {
    const result = parseTextCommand("say /roll 2d6");
    expect(result.matched).toBe(false);
  });
});

// ── isRollCommand ────────────────────────────────────────────

describe("isRollCommand", () => {
  test("returns true for roll command", () => {
    expect(isRollCommand("/roll 2d6")).toBe(true);
  });

  test("returns false for plain text", () => {
    expect(isRollCommand("hello")).toBe(false);
  });

  test("returns false for empty", () => {
    expect(isRollCommand("")).toBe(false);
  });
});
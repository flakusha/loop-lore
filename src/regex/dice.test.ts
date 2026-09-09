import { describe, expect, it, } from "bun:test";
import { DICE_EXTENDED, DICE_ROLL_EXTRACT, DICE_SIMPLE, } from "./dice";

describe("dice regex", () => {
  describe("DICE_SIMPLE", () => {
    it.each([
      ["d20", { count: undefined, sides: "20", modifier: undefined, },],
      ["2d6", { count: "2", sides: "6", modifier: undefined, },],
      ["2d6+3", { count: "2", sides: "6", modifier: "+3", },],
      ["4d8-1", { count: "4", sides: "8", modifier: "-1", },],
      ["1d10+5", { count: "1", sides: "10", modifier: "+5", },],
    ],)("parses '%s'", (input, expected,) => {
      const match = DICE_SIMPLE.exec(input,);
      expect(match,).not.toBeNull();
      expect(match?.[1],).toBe(expected.count,);
      expect(match?.[2],).toBe(expected.sides,);
      expect(match?.[3],).toBe(expected.modifier,);
    },);

    it("returns null for invalid notation", () => {
      expect(DICE_SIMPLE.exec("d",),).toBeNull();
      expect(DICE_SIMPLE.exec("2d",),).toBeNull();
      expect(DICE_SIMPLE.exec("abc",),).toBeNull();
      expect(DICE_SIMPLE.exec("dd20",),).toBeNull();
    });
  });

  describe("DICE_EXTENDED", () => {
    it.each([
      ["d20", { count: "", sides: "20", modifier: undefined, advantage: undefined, explode: undefined, },],
      ["2d6+3", { count: "2", sides: "6", modifier: "+3", advantage: undefined, explode: undefined, },],
      ["d20 adv", { count: "", sides: "20", modifier: undefined, advantage: "adv", explode: undefined, },],
      ["d20 dis", { count: "", sides: "20", modifier: undefined, advantage: "dis", explode: undefined, },],
      ["6d6 x", { count: "6", sides: "6", modifier: undefined, advantage: undefined, explode: "x", },],
      ["2d6+2 adv x", { count: "2", sides: "6", modifier: "+2", advantage: "adv", explode: "x", },],
    ],)("parses '%s'", (input, expected,) => {
      const match = DICE_EXTENDED.exec(input,);
      expect(match,).not.toBeNull();
      expect(match?.[1],).toBe(expected.count,);
      expect(match?.[2],).toBe(expected.sides,);
      expect(match?.[3],).toBe(expected.modifier,);
      expect(match?.[4],).toBe(expected.advantage,);
      expect(match?.[5],).toBe(expected.explode,);
    },);
  });

  describe("DICE_ROLL_EXTRACT", () => {
    it("extracts dice from text", () => {
      const match = DICE_ROLL_EXTRACT.exec("Roll 2d6+3 damage",);
      expect(match?.[1],).toBe("2",);
      expect(match?.[2],).toBe("6",);
      expect(match?.[3],).toBe("+3",);
    });

    it("extracts simple dice", () => {
      const match = DICE_ROLL_EXTRACT.exec("Roll d20 for initiative",);
      expect(match?.[1],).toBeUndefined();
      expect(match?.[2],).toBe("20",);
    });

    it("returns null for no dice", () => {
      expect(DICE_ROLL_EXTRACT.exec("No dice here",),).toBeNull();
    });
  });

  // === Boundary / overflow edge cases ===
  // Pin the regex's contract at unusual inputs. The regex itself doesn't
  // bound the numeric fields; downstream consumers (the dice roller) are
  // responsible for rejecting absurd magnitudes. These tests assert what
  // the regex matches so a future tightening is intentional, not silent.

  describe("DICE_SIMPLE — boundary", () => {
    it.each([
      ["0d20", "0", "20", undefined],   // count=0 (no-op roll downstream)
      ["d0", undefined, "0", undefined], // sides=0 (no-op × undefined downstream)
      ["0d0", "0", "0", undefined],      // degenerate
      ["1000000d6", "1000000", "6", undefined], // huge count — matches, DoS surface
    ],)("parses '%s'", (input, count, sides, modifier) => {
      const m = DICE_SIMPLE.exec(input);
      expect(m).not.toBeNull();
      expect(m?.[1]).toBe(count);
      expect(m?.[2]).toBe(sides);
      expect(m?.[3]).toBe(modifier);
    },);

    it.each([
      "2.5d6",   // decimal count — rejected
      "-2d6",    // negative count — rejected
      "+2d6",    // explicit + count — rejected (count is unprefixed)
      "2d-6",    // negative sides — rejected
      "2d6+",    // dangling modifier sign — rejected
      "2d6-",    // dangling modifier sign — rejected
      "2d6++3",  // double modifier — rejected
      "2d6 3",   // whitespace in modifier — rejected
      "2 d 6",   // whitespace in roll — rejected
      " 2d6",    // leading whitespace — rejected (regex anchored)
      "2d6 ",    // trailing whitespace — rejected
    ],)("rejects invalid '%s'", (input) => {
      expect(DICE_SIMPLE.exec(input)).toBeNull();
    },);

    it("accepts a 10-digit modifier (no upper bound on numeric fields)", () => {
      // Pin: the regex matches modifiers of arbitrary length. Downstream
      // arithmetic on a 10-digit modifier still fits in JS Number; bigger
      // than that and bigint is required.
      expect(DICE_SIMPLE.exec("2d6+9999999999")?.[3]).toBe("+9999999999");
    });
  });

  describe("DICE_EXTENDED — boundary", () => {
    it("'d20' has empty count, undefined modifier, no adv/dis/x", () => {
      const m = DICE_EXTENDED.exec("d20");
      expect(m?.[1]).toBe("");
      expect(m?.[2]).toBe("20");
      expect(m?.[3]).toBeUndefined();
      expect(m?.[4]).toBeUndefined();
      expect(m?.[5]).toBeUndefined();
    });

    it("'2d6 adv' parses adv/dis suffix", () => {
      const m = DICE_EXTENDED.exec("2d6 adv");
      expect(m?.[4]).toBe("adv");
    });

    it("'2d6 adv x' parses both adv/dis and explode x", () => {
      const m = DICE_EXTENDED.exec("2d6 adv x");
      expect(m?.[4]).toBe("adv");
      expect(m?.[5]).toBe("x");
    });

    it("'2d6xdis' is rejected (x must follow adv/dis, not precede)", () => {
      // The regex has optional \s*(adv|dis)?\s*(x)? — whitespace is
      // optional. 'xdis' would only match if separated by whitespace.
      expect(DICE_EXTENDED.exec("2d6xdis")).toBeNull();
    });

    it("'2d6  adv' (multiple spaces) parses adv", () => {
      expect(DICE_EXTENDED.exec("2d6  adv")?.[4]).toBe("adv");
    });

    it("case-sensitive: ADV/Dis/X rejected", () => {
      expect(DICE_EXTENDED.exec("2d6 ADV")).toBeNull();
      expect(DICE_EXTENDED.exec("2d6 disadv")).toBeNull();
      expect(DICE_EXTENDED.exec("2d6 X")).toBeNull();
    });
  });

  describe("DICE_ROLL_EXTRACT — extraction edge cases", () => {
    it("extracts first valid dice from a sentence with multiple rolls", () => {
      const m = DICE_ROLL_EXTRACT.exec("Roll d6 and d20 and d100");
      expect(m?.[0]).toBe("d6");
      expect(m?.[2]).toBe("6");
    });

    it("'1000000d6 attack' — regex matches the huge count (DoS surface downstream)", () => {
      // Pin: the regex matches '1000000d6'. Downstream Array(1000000).fill(0)
      // would OOM; that's a downstream concern, but this test guards against
      // the regex silently truncating the count.
      const m = DICE_ROLL_EXTRACT.exec("1000000d6 attack");
      expect(m?.[1]).toBe("1000000");
      expect(m?.[2]).toBe("6");
    });

    it("'dd20' is matched as 'd20' (the leading 'd' is consumed greedily)", () => {
      // 'dd20' → regex finds 'd20' starting at position 1. This is a quirk
      // worth pinning: 'dd20' is NOT a typoed dice notation, it just so
      // happens that 'd20' appears inside it.
      const m = DICE_ROLL_EXTRACT.exec("dd20");
      expect(m?.[0]).toBe("d20");
      expect(m?.[2]).toBe("20");
    });
  });
});

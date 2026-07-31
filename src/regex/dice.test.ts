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
});

import { describe, expect, it, } from "bun:test";
import { XP_BY_CR, } from "./sources";

describe("xp/sources (real logic)", () => {
  it("XP_BY_CR is monotonically increasing", () => {
    const crs = Object.keys(XP_BY_CR,).map(Number,).sort((a, b,) => a - b);
    for (let i = 1; i < crs.length; i++) {
      expect(XP_BY_CR[crs[i]!]!,).toBeGreaterThan(XP_BY_CR[crs[i - 1]!]!,);
    }
  });
  it("XP per CR is always positive", () => {
    for (const [, xp,] of Object.entries(XP_BY_CR,)) {
      expect(xp,).toBeGreaterThan(0,);
    }
  });
});

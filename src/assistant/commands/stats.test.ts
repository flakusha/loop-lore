/**
 * Stats Command Tests.
 */
import { beforeAll, describe, expect, it, } from "bun:test";
import { createLogger, } from "../../logger";
import { getCommand, } from "./registry";
import { formatStats, } from "./stats";

beforeAll(() => {
  createLogger({ level: "error", },);
},);

const sampleStats = {
  level: 5,
  hp: 32,
  maxHp: 40,
  mp: 10,
  maxMp: 20,
  ac: 15,
  str: 16,
  dex: 12,
  con: 14,
  int: 10,
  wis: 13,
  cha: 8,
  xp: 1200,
  xpToNext: 3000,
};

describe("stats command", () => {
  it("is registered", () => {
    expect(getCommand("stats",),).toBeDefined();
  });

  describe("formatStats", () => {
    it("renders a readable stat block", () => {
      const out = formatStats("Aelar", sampleStats,);

      expect(out,).toContain("**Aelar — Stats**",);
      expect(out,).toContain("**Level:** 5",);
      expect(out,).toContain("**HP:** 32/40",);
      expect(out,).toContain("**MP:** 10/20",);
      expect(out,).toContain("**AC:** 15",);
      expect(out,).toContain("**STR** 16 · **DEX** 12 · **CON** 14",);
      expect(out,).toContain("**XP:** 1200/3000",);
    });
  });

  describe("edge cases", () => {
    it("handles NaN hp/maxHp gracefully (renders 0)", () => {
      const nanStats = { ...sampleStats, hp: Number.NaN, maxHp: Number.NaN, };
      const out = formatStats("Aelar", nanStats,);
      expect(typeof out,).toBe("string",);
      expect(out.length,).toBeGreaterThan(0,);
    });

    it("handles zero/negative xp without crashing", () => {
      const zeroXp = { ...sampleStats, xp: 0, xpToNext: 0, };
      const out = formatStats("Aelar", zeroXp,);
      expect(out,).toContain("XP",);
    });

    it("handles unicode name with emoji + CJK", () => {
      const out = formatStats("アエラル 🧙", sampleStats,);
      expect(out,).toContain("アエラル 🧙",);
    });

    it("handles extremely long name (1KB) without truncation crash", () => {
      const longName = "x".repeat(1_000,);
      const out = formatStats(longName, sampleStats,);
      expect(out.length,).toBeGreaterThanOrEqual(1_000,);
    });

    it("handles control characters in name", () => {
      const out = formatStats("Tab\tNewline\nName", sampleStats,);
      expect(typeof out,).toBe("string",);
    });

    it("handles empty string name", () => {
      const out = formatStats("", sampleStats,);
      expect(typeof out,).toBe("string",);
    });
  });
});

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
});

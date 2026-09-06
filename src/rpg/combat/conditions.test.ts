import { describe, expect, it, } from "bun:test";
import { isCombatOver, isDead, isIncapacitated, } from "./conditions";

describe("rpg/combat/conditions (real logic)", () => {
  it("isIncapacitated detects stunned/paralyzed", () => {
    expect(isIncapacitated({ conditions: ["stunned",], hp: 10, isNpc: false, },),).toBe(true,);
    expect(isIncapacitated({ conditions: [], hp: 10, isNpc: false, },),).toBe(false,);
  });
  it("isDead detects 0 or negative HP", () => {
    expect(isDead({ conditions: [], hp: 0, isNpc: true, },),).toBe(true,);
    expect(isDead({ conditions: [], hp: -5, isNpc: false, },),).toBe(true,);
    expect(isDead({ conditions: [], hp: 10, isNpc: true, },),).toBe(false,);
  });
  it("isCombatOver detects defeat", () => {
    const result = isCombatOver([
      { conditions: [], hp: 0, isNpc: false, },
      { conditions: [], hp: 10, isNpc: true, },
    ],);
    expect(result.over,).toBe(true,);
    expect(result.winner,).toBe("enemy",);
  });
  it("isCombatOver not over when both sides alive", () => {
    const result = isCombatOver([
      { conditions: [], hp: 10, isNpc: false, },
      { conditions: [], hp: 10, isNpc: true, },
    ],);
    expect(result.over,).toBe(false,);
  });
});

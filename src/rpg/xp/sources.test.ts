import { describe, expect, it, } from "bun:test";
import {
  DISCOVERY_XP,
  encodeReferencePair,
  isXpSource,
  QUEST_XP_MINIMUM,
  TRAVEL_LEG_XP,
  XP_BY_CR,
  xpForDiscovery,
  xpForEnemyDefeat,
  xpForQuest,
  xpForSkillChallenge,
  xpForTravelLeg,
  XpSource,
} from "./sources";

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

describe("xpForEnemyDefeat", () => {
  it("CR values come from the table; unknown CRs fall back to 100", () => {
    expect(xpForEnemyDefeat(0,),).toBe(10,);
    expect(xpForEnemyDefeat(3,),).toBe(700,);
    expect(xpForEnemyDefeat(99,),).toBe(100,);
    expect(xpForEnemyDefeat(7.5,),).toBe(100,);
  });

  it("the award splits by party size and halves for assists", () => {
    expect(xpForEnemyDefeat(3, 2,),).toBe(350,);
    expect(xpForEnemyDefeat(3, 3,),).toBe(233,);
    expect(xpForEnemyDefeat(3, 1, true,),).toBe(350,);
  });
});

describe("xpForQuest", () => {
  it("difficulty multipliers scale the level-band award", () => {
    const medium = xpForQuest(1,);
    expect(xpForQuest(1, "easy",),).toBe(Math.floor(medium * 0.5,),);
    expect(xpForQuest(1, "hard",),).toBe(Math.floor(medium * 1.5,),);
  });

  it("a capped character floors to QUEST_XP_MINIMUM instead of 0", () => {
    expect(xpForQuest(20, "hard",),).toBe(QUEST_XP_MINIMUM,);
    expect(xpForQuest(25, "medium",),).toBe(QUEST_XP_MINIMUM,);
  });
});

describe("xpForSkillChallenge", () => {
  it("scales with level and difficulty", () => {
    expect(xpForSkillChallenge(3, "easy",),).toBe(75,);
    expect(xpForSkillChallenge(3,),).toBe(150,);
    expect(xpForSkillChallenge(3, "hard",),).toBe(300,);
  });
});

describe("flat awards", () => {
  it("discovery and travel legs pay their flat constants", () => {
    expect(xpForDiscovery(),).toBe(DISCOVERY_XP,);
    expect(xpForTravelLeg(),).toBe(TRAVEL_LEG_XP,);
  });
});

describe("XpSource vocabulary", () => {
  it("accepts every member and rejects unknown sources", () => {
    for (const value of Object.values(XpSource,)) {
      expect(isXpSource(value,),).toBe(true,);
    }

    expect(isXpSource("quest",),).toBe(true,);
    expect(isXpSource("nope",),).toBe(false,);
  });
});

describe("encodeReferencePair", () => {
  it("is injective where a colon join would collide", () => {
    expect(encodeReferencePair("w:1", "boss",),).not.toBe(encodeReferencePair("w", "1:boss",),);
    expect(encodeReferencePair("a", "b",),).toBe(encodeReferencePair("a", "b",),);
  });

  it("encodes as a JSON array pair", () => {
    expect(encodeReferencePair("world-1", "loc-9",),).toBe(JSON.stringify(["world-1", "loc-9",],),);
  });
});

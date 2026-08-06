/**
 * RPG XP System Tests
 *
 * Tests XP progression, level-up thresholds, and XP sources.
 */
import { describe, expect, it, } from "bun:test";
import {
  asiRemaining,
  awardXp,
  canLevelUp,
  grantsAsi,
  hpOnLevelUp,
  levelFromXp,
  xpForEnemyDefeat,
  xpForLevel,
  xpForQuest,
  xpForSkillChallenge,
  xpToNextLevel,
} from "./xp.js";

describe("xpForLevel", () => {
  it("level 1 requires 0 XP", () => {
    expect(xpForLevel(1,),).toBe(0,);
  });

  it("level 2 requires 300 XP", () => {
    expect(xpForLevel(2,),).toBe(300,);
  });

  it("level 20 requires 355000 XP", () => {
    expect(xpForLevel(20,),).toBe(355_000,);
  });

  it("caps at level 20", () => {
    expect(xpForLevel(25,),).toBe(355_000,);
  });

  it("floors at level 1", () => {
    expect(xpForLevel(0,),).toBe(0,);
  });
});

describe("xpToNextLevel", () => {
  it("level 1 needs 300 XP to level 2", () => {
    expect(xpToNextLevel(1, 0,),).toBe(300,);
  });

  it("level 1 with 100 XP needs 200 more", () => {
    expect(xpToNextLevel(1, 100,),).toBe(200,);
  });

  it("max level returns Infinity", () => {
    expect(xpToNextLevel(20, 355_000,),).toBe(Infinity,);
  });
});

describe("canLevelUp", () => {
  it("can level up with enough XP", () => {
    expect(canLevelUp(1, 300,),).toBe(true,);
  });

  it("cannot level up without enough XP", () => {
    expect(canLevelUp(1, 299,),).toBe(false,);
  });

  it("max level cannot level up", () => {
    expect(canLevelUp(20, 999_999,),).toBe(false,);
  });
});

describe("levelFromXp", () => {
  it("0 XP is level 1", () => {
    expect(levelFromXp(0,),).toBe(1,);
  });

  it("300 XP is level 2", () => {
    expect(levelFromXp(300,),).toBe(2,);
  });

  it("355000 XP is level 20", () => {
    expect(levelFromXp(355_000,),).toBe(20,);
  });

  it("intermediate XP gives correct level", () => {
    expect(levelFromXp(500,),).toBe(2,); // between level 2 (300) and 3 (900)
    expect(levelFromXp(1000,),).toBe(3,); // between level 3 (900) and 4 (2700)
  });
});

describe("awardXp", () => {
  it("awards XP and checks level up", () => {
    const result = awardXp(1, 0, 300,);
    expect(result.newXp,).toBe(300,);
    expect(result.newLevel,).toBe(2,);
    expect(result.leveledUp,).toBe(true,);
    expect(result.levelsGained,).toBe(1,);
  });

  it("no level up without enough XP", () => {
    const result = awardXp(1, 0, 100,);
    expect(result.newXp,).toBe(100,);
    expect(result.newLevel,).toBe(1,);
    expect(result.leveledUp,).toBe(false,);
    expect(result.levelsGained,).toBe(0,);
  });

  it("can gain multiple levels at once", () => {
    // 900 XP from level 1 gets to level 3
    const result = awardXp(1, 0, 900,);
    expect(result.newLevel,).toBe(3,);
    expect(result.levelsGained,).toBe(2,);
  });
});

describe("xpForEnemyDefeat", () => {
  it("CR 0 enemy gives 10 XP", () => {
    expect(xpForEnemyDefeat(0,),).toBe(10,);
  });

  it("CR 1 enemy gives 200 XP", () => {
    expect(xpForEnemyDefeat(1,),).toBe(200,);
  });

  it("splits XP across party", () => {
    expect(xpForEnemyDefeat(1, 4,),).toBe(50,); // 200 / 4
  });

  it("assist gets half XP", () => {
    expect(xpForEnemyDefeat(1, 1, true,),).toBe(100,);
  });

  it("unknown CR defaults to 100", () => {
    expect(xpForEnemyDefeat(99,),).toBe(100,);
  });
});

describe("xpForQuest", () => {
  it("medium quest at level 1 gives base XP", () => {
    const result = xpForQuest(1, "medium",);
    expect(result,).toBeGreaterThan(0,);
  });

  it("deadly quest gives more XP than easy", () => {
    const easy = xpForQuest(5, "easy",);
    const deadly = xpForQuest(5, "deadly",);
    expect(deadly,).toBeGreaterThan(easy,);
  });
});

describe("xpForSkillChallenge", () => {
  it("returns positive XP", () => {
    expect(xpForSkillChallenge(5, "medium",),).toBeGreaterThan(0,);
  });

  it("hard gives more than easy", () => {
    const easy = xpForSkillChallenge(5, "easy",);
    const hard = xpForSkillChallenge(5, "hard",);
    expect(hard,).toBeGreaterThan(easy,);
  });
});

describe("hpOnLevelUp", () => {
  it("first level uses max hit die", () => {
    expect(hpOnLevelUp(8, 0, true,),).toBe(8,);
  });

  it("first level adds CON modifier", () => {
    expect(hpOnLevelUp(8, 2, true,),).toBe(10,);
  });

  it("subsequent levels use average", () => {
    expect(hpOnLevelUp(8, 0, false,),).toBe(5,); // average of d8
  });

  it("subsequent levels add CON modifier", () => {
    expect(hpOnLevelUp(8, 2, false,),).toBe(7,);
  });

  it("minimum HP gain is 1", () => {
    expect(hpOnLevelUp(4, -5, false,),).toBe(1,);
  });
});

describe("ASI", () => {
  it("level 4 grants ASI", () => {
    expect(grantsAsi(4,),).toBe(true,);
  });

  it("level 5 does not grant ASI", () => {
    expect(grantsAsi(5,),).toBe(false,);
  });

  it("asiRemaining counts future ASIs", () => {
    expect(asiRemaining(1,),).toBe(5,); // levels 4, 8, 12, 16, 19
    expect(asiRemaining(4,),).toBe(4,); // levels 8, 12, 16, 19
    expect(asiRemaining(19,),).toBe(0,);
  });
});

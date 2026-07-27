/**
 * Skills Service Tests
 */
import { describe, expect, it, } from "bun:test";
import { ProficiencyLevel, SkillCategory, } from "./service";

describe("SkillsService", () => {
  describe("SkillCategory", () => {
    it("should have correct category values", () => {
      expect(SkillCategory.Combat,).toBe("combat",);
      expect(SkillCategory.Magic,).toBe("magic",);
      expect(SkillCategory.Crafting,).toBe("crafting",);
      expect(SkillCategory.Social,).toBe("social",);
      expect(SkillCategory.Exploration,).toBe("exploration",);
      expect(SkillCategory.Survival,).toBe("survival",);
      expect(SkillCategory.Knowledge,).toBe("knowledge",);
      expect(SkillCategory.Stealth,).toBe("stealth",);
    });
  });

  describe("ProficiencyLevel", () => {
    it("should have correct proficiency values", () => {
      expect(ProficiencyLevel.Novice,).toBe("novice",);
      expect(ProficiencyLevel.Apprentice,).toBe("apprentice",);
      expect(ProficiencyLevel.Journeyman,).toBe("journeyman",);
      expect(ProficiencyLevel.Expert,).toBe("expert",);
      expect(ProficiencyLevel.Master,).toBe("master",);
      expect(ProficiencyLevel.Grandmaster,).toBe("grandmaster",);
    });
  });
});

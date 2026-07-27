/**
 * Achievements Service Tests
 */
import { describe, expect, it, } from "bun:test";
import { AchievementCategory, AchievementTier, } from "./service";

describe("AchievementsService", () => {
  describe("AchievementCategory", () => {
    it("should have correct category values", () => {
      expect(AchievementCategory.Story,).toBe("story",);
      expect(AchievementCategory.Combat,).toBe("combat",);
      expect(AchievementCategory.Exploration,).toBe("exploration",);
      expect(AchievementCategory.Social,).toBe("social",);
      expect(AchievementCategory.Crafting,).toBe("crafting",);
      expect(AchievementCategory.Collection,).toBe("collection",);
      expect(AchievementCategory.Mastery,).toBe("mastery",);
      expect(AchievementCategory.Secret,).toBe("secret",);
    });
  });

  describe("AchievementTier", () => {
    it("should have correct tier values", () => {
      expect(AchievementTier.Bronze,).toBe("bronze",);
      expect(AchievementTier.Silver,).toBe("silver",);
      expect(AchievementTier.Gold,).toBe("gold",);
      expect(AchievementTier.Platinum,).toBe("platinum",);
      expect(AchievementTier.Diamond,).toBe("diamond",);
    });
  });
});

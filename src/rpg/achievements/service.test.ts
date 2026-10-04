/**
 * Achievements Service Tests
 */
import { describe, expect, it, } from "bun:test";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertPlayerAchievements,
  insertUsers,
} from "../../test-utils/insert-helpers";
import {
  AchievementCategory,
  AchievementsService,
  AchievementTier,
} from "./service";

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

  describe("class dispatch", () => {
    it("createAchievement applies defaults and persists the row", async () => {
      const { db, } = await createTestDb();
      const service = new AchievementsService(db,);
      const achievement = await service.createAchievement({
        name: "First Blood",
        description: "Win a fight",
        category: AchievementCategory.Combat,
        tier: AchievementTier.Bronze,
        unlockCondition: { type: "counter", target: "wins", count: 1, },
      },);

      expect(achievement.id,).toBeTruthy();
      expect(achievement.icon,).toBeNull();
      expect(achievement.isSecret,).toBe(false,);
      expect(achievement.isHidden,).toBe(false,);
      expect(achievement.rewards,).toEqual([],);
      expect(achievement.metadata,).toEqual({},);
      const fetched = await service.getAchievement(achievement.id,);
      expect(fetched?.name,).toBe("First Blood",);
      expect(fetched?.unlockCondition,).toEqual({ type: "counter", target: "wins", count: 1, },);
    });

    it("createAchievement stores explicit optional fields", async () => {
      const { db, } = await createTestDb();
      const service = new AchievementsService(db,);
      const achievement = await service.createAchievement({
        name: "Rich",
        description: "Hold 1000 gold",
        category: AchievementCategory.Collection,
        tier: AchievementTier.Gold,
        unlockCondition: { type: "simple", },
        icon: "coins",
        isSecret: true,
        isHidden: true,
        rewards: [{ type: "experience", value: 100, description: "+100 XP", },],
        metadata: { origin: "core", },
      },);

      expect(achievement.icon,).toBe("coins",);
      expect(achievement.isSecret,).toBe(true,);
      expect(achievement.isHidden,).toBe(true,);
      expect(achievement.rewards,).toHaveLength(1,);
      expect(achievement.metadata,).toEqual({ origin: "core", },);
    });

    it("getAchievement returns null for unknown id", async () => {
      const { db, } = await createTestDb();
      const service = new AchievementsService(db,);
      expect(await service.getAchievement("nope",),).toBeNull();
    });

    it("listAchievements returns empty array on empty state", async () => {
      const { db, } = await createTestDb();
      const service = new AchievementsService(db,);
      expect(await service.listAchievements(),).toEqual([],);
    });

    it("listAchievements filters by category and excludes secret by default", async () => {
      const { db, } = await createTestDb();
      const service = new AchievementsService(db,);
      await service.createAchievement({
        name: "c1",
        description: "",
        category: AchievementCategory.Combat,
        tier: AchievementTier.Bronze,
        unlockCondition: { type: "simple", },
      },);

      await service.createAchievement({
        name: "c2",
        description: "",
        category: AchievementCategory.Combat,
        tier: AchievementTier.Silver,
        unlockCondition: { type: "simple", },
      },);

      await service.createAchievement({
        name: "s1",
        description: "",
        category: AchievementCategory.Story,
        tier: AchievementTier.Bronze,
        unlockCondition: { type: "simple", },
      },);

      await service.createAchievement({
        name: "sec",
        description: "",
        category: AchievementCategory.Secret,
        tier: AchievementTier.Diamond,
        isSecret: true,
        unlockCondition: { type: "simple", },
      },);

      expect(await service.listAchievements(),).toHaveLength(3,);
      expect(await service.listAchievements(AchievementCategory.Combat,),).toHaveLength(2,);
      expect(await service.listAchievements(undefined, true,),).toHaveLength(4,);
    });

    it("updateAchievement applies partial updates only", async () => {
      const { db, } = await createTestDb();
      const service = new AchievementsService(db,);
      const achievement = await service.createAchievement({
        name: "Before",
        description: "desc",
        category: AchievementCategory.Story,
        tier: AchievementTier.Bronze,
        unlockCondition: { type: "simple", },
      },);

      const renamed = await service.updateAchievement(achievement.id, { name: "After", },);
      expect(renamed.name,).toBe("After",);
      expect(renamed.description,).toBe("desc",);
      expect(renamed.tier,).toBe(AchievementTier.Bronze,);
      const withRewards = await service.updateAchievement(achievement.id, {
        rewards: [{ type: "item", value: "sword", description: "Sword", },],
      },);

      expect(withRewards.rewards,).toHaveLength(1,);
      expect(withRewards.name,).toBe("After",);
    });

    it("deleteAchievement removes definition and player progress", async () => {
      const { db, } = await createTestDb();
      const service = new AchievementsService(db,);
      const achievement = await service.createAchievement({
        name: "Doomed",
        description: "",
        category: AchievementCategory.Story,
        tier: AchievementTier.Bronze,
        unlockCondition: { type: "simple", },
      },);

      await insertUsers(db, "player-1", "Player 1", { id: "player-1", },);
      await insertPlayerAchievements(db, "player-1", achievement.id, {
        progress: 0,
        max_progress: 1,
        status: "locked",
      },);

      await service.deleteAchievement(achievement.id,);
      expect(await service.getAchievement(achievement.id,),).toBeNull();
      expect(await service.getPlayerAchievement("player-1", achievement.id,),).toBeNull();
    });

    it("getPlayerAchievement returns null without progress", async () => {
      const { db, } = await createTestDb();
      const service = new AchievementsService(db,);
      expect(await service.getPlayerAchievement("ghost", "nope",),).toBeNull();
    });

    it("getPlayerAchievements returns empty array for unknown player", async () => {
      const { db, } = await createTestDb();
      const service = new AchievementsService(db,);
      expect(await service.getPlayerAchievements("ghost",),).toEqual([],);
    });

    it("updateProgress creates entry with default increment of 1", async () => {
      const { db, } = await createTestDb();
      const service = new AchievementsService(db,);
      const achievement = await service.createAchievement({
        name: "Steps",
        description: "",
        category: AchievementCategory.Exploration,
        tier: AchievementTier.Bronze,
        unlockCondition: { type: "counter", target: "steps", count: 5, },
      },);

      await insertUsers(db, "player-2", "Player 2", { id: "player-2", },);
      const result = await service.updateProgress("player-2", achievement.id,);
      expect(result,).toMatchObject({ oldProgress: 0, newProgress: 1, unlocked: false, },);
      expect(result.rewards,).toEqual([],);
      const progress = await service.getPlayerAchievement("player-2", achievement.id,);
      expect(progress?.maxProgress,).toBe(5,);
      expect(progress?.status,).toBe("locked",);
    });

    it("updateProgress clamps at maxProgress and unlocks", async () => {
      const { db, } = await createTestDb();
      const service = new AchievementsService(db,);
      const achievement = await service.createAchievement({
        name: "Steps",
        description: "",
        category: AchievementCategory.Exploration,
        tier: AchievementTier.Bronze,
        unlockCondition: { type: "counter", target: "steps", count: 3, },
        rewards: [{ type: "experience", value: 50, description: "+50 XP", },],
      },);

      await insertUsers(db, "player-3", "Player 3", { id: "player-3", },);
      const first = await service.updateProgress("player-3", achievement.id, 2,);
      expect(first,).toMatchObject({ newProgress: 2, unlocked: false, },);
      const second = await service.updateProgress("player-3", achievement.id, 10,);
      expect(second,).toMatchObject({ oldProgress: 2, newProgress: 3, unlocked: true, },);
      expect(second.rewards,).toHaveLength(1,);
      const progress = await service.getPlayerAchievement("player-3", achievement.id,);
      expect(progress?.status,).toBe("unlocked",);
      expect(progress?.unlockedAt,).not.toBeNull();
    });

    it("updateProgress is a no-op once unlocked", async () => {
      const { db, } = await createTestDb();
      const service = new AchievementsService(db,);
      const achievement = await service.createAchievement({
        name: "Steps",
        description: "",
        category: AchievementCategory.Exploration,
        tier: AchievementTier.Bronze,
        unlockCondition: { type: "counter", target: "steps", count: 1, },
      },);

      await insertUsers(db, "player-4", "Player 4", { id: "player-4", },);
      await service.updateProgress("player-4", achievement.id,);
      const again = await service.updateProgress("player-4", achievement.id, 5,);
      expect(again,).toMatchObject({ newProgress: 1, unlocked: false, rewards: [], },);
    });

    it("updateProgress throws for unknown achievement", async () => {
      const { db, } = await createTestDb();
      const service = new AchievementsService(db,);
      await insertUsers(db, "player-5", "Player 5", { id: "player-5", },);
      await expect(service.updateProgress("player-5", "nope",),).rejects.toThrow("Achievement not found",);
    });

    it("claimRewards throws when player has no progress", async () => {
      const { db, } = await createTestDb();
      const service = new AchievementsService(db,);
      const achievement = await service.createAchievement({
        name: "A",
        description: "",
        category: AchievementCategory.Story,
        tier: AchievementTier.Bronze,
        unlockCondition: { type: "simple", },
      },);

      await expect(service.claimRewards("ghost", achievement.id,),).rejects.toThrow("Player achievement not found",);
    });

    it("claimRewards throws when achievement is locked", async () => {
      const { db, } = await createTestDb();
      const service = new AchievementsService(db,);
      const achievement = await service.createAchievement({
        name: "A",
        description: "",
        category: AchievementCategory.Story,
        tier: AchievementTier.Bronze,
        unlockCondition: { type: "simple", },
      },);

      await insertUsers(db, "player-6", "Player 6", { id: "player-6", },);
      await insertPlayerAchievements(db, "player-6", achievement.id, {
        progress: 0,
        max_progress: 1,
        status: "locked",
      },);

      await expect(service.claimRewards("player-6", achievement.id,),).rejects.toThrow("Achievement not unlocked",);
    });

    it("claimRewards returns rewards and marks claimed; second claim throws", async () => {
      const { db, } = await createTestDb();
      const service = new AchievementsService(db,);
      const achievement = await service.createAchievement({
        name: "A",
        description: "",
        category: AchievementCategory.Story,
        tier: AchievementTier.Bronze,
        unlockCondition: { type: "simple", },
        rewards: [{ type: "experience", value: 25, description: "+25 XP", },],
      },);

      await insertUsers(db, "player-7", "Player 7", { id: "player-7", },);
      await insertPlayerAchievements(db, "player-7", achievement.id, {
        progress: 1,
        max_progress: 1,
        status: "unlocked",
        unlocked_at: "2026-01-01",
      },);

      const rewards = await service.claimRewards("player-7", achievement.id,);
      expect(rewards,).toHaveLength(1,);
      const progress = await service.getPlayerAchievement("player-7", achievement.id,);
      expect(progress?.status,).toBe("claimed",);
      expect(progress?.claimedAt,).not.toBeNull();
      await expect(service.claimRewards("player-7", achievement.id,),).rejects.toThrow("Rewards already claimed",);
    });

    it("isUnlocked reflects progress state", async () => {
      const { db, } = await createTestDb();
      const service = new AchievementsService(db,);
      const achievement = await service.createAchievement({
        name: "A",
        description: "",
        category: AchievementCategory.Story,
        tier: AchievementTier.Bronze,
        unlockCondition: { type: "simple", },
      },);

      await insertUsers(db, "player-8", "Player 8", { id: "player-8", },);
      expect(await service.isUnlocked("player-8", achievement.id,),).toBe(false,);
      await insertPlayerAchievements(db, "player-8", achievement.id, {
        progress: 1,
        max_progress: 1,
        status: "unlocked",
        unlocked_at: "2026-01-01",
      },);

      expect(await service.isUnlocked("player-8", achievement.id,),).toBe(true,);
    });

    it("getPlayerStats reports empty state", async () => {
      const { db, } = await createTestDb();
      const service = new AchievementsService(db,);
      const stats = await service.getPlayerStats("ghost",);
      expect(stats,).toEqual({ totalUnlocked: 0, totalAvailable: 0, byCategory: {}, byTier: {}, },);
    });

    it("getPlayerStats counts unlocked by category and tier", async () => {
      const { db, } = await createTestDb();
      const service = new AchievementsService(db,);
      const combat = await service.createAchievement({
        name: "c",
        description: "",
        category: AchievementCategory.Combat,
        tier: AchievementTier.Bronze,
        unlockCondition: { type: "simple", },
      },);

      await service.createAchievement({
        name: "s",
        description: "",
        category: AchievementCategory.Story,
        tier: AchievementTier.Silver,
        unlockCondition: { type: "simple", },
      },);

      await insertUsers(db, "player-9", "Player 9", { id: "player-9", },);
      await insertPlayerAchievements(db, "player-9", combat.id, {
        progress: 1,
        max_progress: 1,
        status: "unlocked",
        unlocked_at: "2026-01-01",
      },);

      const stats = await service.getPlayerStats("player-9",);
      expect(stats.totalUnlocked,).toBe(1,);
      expect(stats.totalAvailable,).toBe(2,);
      expect(stats.byCategory,).toEqual({ combat: 1, },);
      expect(stats.byTier,).toEqual({ bronze: 1, },);
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

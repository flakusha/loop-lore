/**
 * Quest Service Tests
 */
import { beforeEach, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import { QuestStatus, QuestType, } from "../../db/enums-story";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { createTestActors, createTestWorld, } from "../../characters/services/test-helpers";
import { QuestService, } from "./service";

describe("QuestService", () => {
  let db: Kysely<DB>;
  let service: QuestService;
  let worldId: string;
  let actorId: string;

  beforeEach(async () => {
    const testDb = await createTestDb();
    db = testDb.db;
    service = new QuestService(db,);

    // Create required FK records — actors first (creates user), then world
    const actors = await createTestActors(db, "test-actor-quest",);
    actorId = actors.actorId;
    worldId = await createTestWorld(db, "test-world-quest",);
  },);

  describe("createQuest", () => {
    it("should create a quest with defaults", async () => {
      const quest = await service.createQuest({
        world_id: worldId,
        creator_id: actorId,
        name: "Test Quest",
      },);

      expect(quest.id,).toBeDefined();
      expect(quest.name,).toBe("Test Quest",);
      expect(quest.status,).toBe(QuestStatus.Active,);
      expect(quest.type,).toBe(QuestType.Discovery,);
      expect(quest.priority,).toBe(50,);
      expect(quest.progress,).toBe(0,);
      expect(quest.target,).toBe(1,);
    });

    it("should create a quest with custom values", async () => {
      const quest = await service.createQuest({
        world_id: worldId,
        creator_id: actorId,
        name: "Custom Quest",
        description: "A custom quest",
        type: QuestType.Collection,
        priority: 75,
        target: 5,
        objectives: [
          {
            id: "obj-1",
            type: "collect",
            target: "herbs",
            count: 5,
            current: 0,
            completed: false,
          },
        ],
        rewards: [
          {
            type: "experience",
            value: 100,
            claimed: false,
          },
        ],
      },);

      expect(quest.name,).toBe("Custom Quest",);
      expect(quest.description,).toBe("A custom quest",);
      expect(quest.type,).toBe(QuestType.Collection,);
      expect(quest.priority,).toBe(75,);
      expect(quest.target,).toBe(5,);
    });
  });

  describe("getQuest", () => {
    it("should return null for non-existent quest", async () => {
      const quest = await service.getQuest("non-existent",);
      expect(quest,).toBeNull();
    });

    it("should return quest by ID", async () => {
      const created = await service.createQuest({
        world_id: worldId,
        creator_id: actorId,
        name: "Test Quest",
      },);

      const quest = await service.getQuest(created.id,);
      expect(quest,).not.toBeNull();
      expect(quest?.name,).toBe("Test Quest",);
    });
  });

  describe("listQuests", () => {
    it("should list quests for a world", async () => {
      await service.createQuest({
        world_id: worldId,
        creator_id: actorId,
        name: "Quest 1",
      },);
      await service.createQuest({
        world_id: worldId,
        creator_id: actorId,
        name: "Quest 2",
      },);

      // Create a quest in a different world
      const otherWorldId = await createTestWorld(db, "test-world-other",);
      await service.createQuest({
        world_id: otherWorldId,
        creator_id: actorId,
        name: "Quest 3",
      },);

      const quests = await service.listQuests(worldId,);
      expect(quests.length,).toBe(2,);
    });

    it("should filter by status", async () => {
      const quest = await service.createQuest({
        world_id: worldId,
        creator_id: actorId,
        name: "Test Quest",
      },);

      await service.transitionQuest(quest.id, QuestStatus.Completed,);

      const activeQuests = await service.listQuests(worldId, QuestStatus.Active,);
      const completedQuests = await service.listQuests(worldId, QuestStatus.Completed,);

      expect(activeQuests.length,).toBe(0,);
      expect(completedQuests.length,).toBe(1,);
    });
  });

  describe("transitionQuest", () => {
    it("should transition from active to completed", async () => {
      const quest = await service.createQuest({
        world_id: worldId,
        creator_id: actorId,
        name: "Test Quest",
      },);

      const result = await service.transitionQuest(quest.id, QuestStatus.Completed,);

      expect(result.success,).toBe(true,);
      expect(result.from,).toBe(QuestStatus.Active,);
      expect(result.to,).toBe(QuestStatus.Completed,);
      expect(result.quest.completed_at,).not.toBeNull();
    });

    it("should transition from active to failed", async () => {
      const quest = await service.createQuest({
        world_id: worldId,
        creator_id: actorId,
        name: "Test Quest",
      },);

      const result = await service.transitionQuest(quest.id, QuestStatus.Failed,);

      expect(result.success,).toBe(true,);
      expect(result.to,).toBe(QuestStatus.Failed,);
    });

    it("should transition from active to abandoned", async () => {
      const quest = await service.createQuest({
        world_id: worldId,
        creator_id: actorId,
        name: "Test Quest",
      },);

      const result = await service.transitionQuest(quest.id, QuestStatus.Abandoned,);

      expect(result.success,).toBe(true,);
      expect(result.to,).toBe(QuestStatus.Abandoned,);
    });

    it("should allow retry from abandoned to active", async () => {
      const quest = await service.createQuest({
        world_id: worldId,
        creator_id: actorId,
        name: "Test Quest",
      },);

      await service.transitionQuest(quest.id, QuestStatus.Abandoned,);
      const result = await service.transitionQuest(quest.id, QuestStatus.Active,);

      expect(result.success,).toBe(true,);
      expect(result.to,).toBe(QuestStatus.Active,);
    });

    it("should reject invalid transitions", async () => {
      const quest = await service.createQuest({
        world_id: worldId,
        creator_id: actorId,
        name: "Test Quest",
      },);

      await service.transitionQuest(quest.id, QuestStatus.Completed,);
      const result = await service.transitionQuest(quest.id, QuestStatus.Active,);

      expect(result.success,).toBe(false,);
      expect(result.errors.length,).toBeGreaterThan(0,);
    });
  });

  describe("updateProgress", () => {
    it("should update quest progress", async () => {
      const quest = await service.createQuest({
        world_id: worldId,
        creator_id: actorId,
        name: "Test Quest",
        target: 5,
      },);

      const updated = await service.updateProgress(quest.id, 3,);
      expect(updated.progress,).toBe(3,);
      expect(updated.status,).toBe(QuestStatus.Active,);
    });

    it("should auto-complete when progress reaches target", async () => {
      const quest = await service.createQuest({
        world_id: worldId,
        creator_id: actorId,
        name: "Test Quest",
        target: 3,
      },);

      const updated = await service.updateProgress(quest.id, 3,);
      expect(updated.progress,).toBe(3,);
      expect(updated.status,).toBe(QuestStatus.Completed,);
      expect(updated.completed_at,).not.toBeNull();
    });
  });

  describe("objectives", () => {
    it("should get and update objectives", async () => {
      const quest = await service.createQuest({
        world_id: worldId,
        creator_id: actorId,
        name: "Test Quest",
        objectives: [
          {
            id: "obj-1",
            type: "collect",
            target: "herbs",
            count: 5,
            current: 0,
            completed: false,
          },
        ],
      },);

      const objectives = await service.getObjectives(quest.id,);
      expect(objectives.length,).toBe(1,);
      expect(objectives[0]?.current,).toBe(0,);

      const updated = await service.updateObjective(quest.id, "obj-1", 3,);
      expect(updated[0]?.current,).toBe(3,);
      expect(updated[0]?.completed,).toBe(false,);

      const completed = await service.updateObjective(quest.id, "obj-1", 2,);
      expect(completed[0]?.current,).toBe(5,);
      expect(completed[0]?.completed,).toBe(true,);
    });
  });

  describe("rewards", () => {
    it("should get and claim rewards", async () => {
      const quest = await service.createQuest({
        world_id: worldId,
        creator_id: actorId,
        name: "Test Quest",
        rewards: [
          { type: "experience", value: 100, claimed: false, },
          { type: "item", value: "sword-1", claimed: false, },
        ],
      },);

      const rewards = await service.getRewards(quest.id,);
      expect(rewards.length,).toBe(2,);
      expect(rewards[0]?.claimed,).toBe(false,);

      const claimed = await service.claimReward(quest.id, 0,);
      expect(claimed.claimed,).toBe(true,);
      expect(claimed.type,).toBe("experience",);

      // Should fail to claim again
      expect(() => service.claimReward(quest.id, 0,)).toThrow("Reward already claimed",);
    });
  });

  describe("canTransition", () => {
    it("should validate transitions", () => {
      expect(service.canTransition(QuestStatus.Active, QuestStatus.Completed,),).toBe(true,);
      expect(service.canTransition(QuestStatus.Active, QuestStatus.Failed,),).toBe(true,);
      expect(service.canTransition(QuestStatus.Active, QuestStatus.Abandoned,),).toBe(true,);
      expect(service.canTransition(QuestStatus.Completed, QuestStatus.Active,),).toBe(false,);
      expect(service.canTransition(QuestStatus.Abandoned, QuestStatus.Active,),).toBe(true,);
    });
  });
});

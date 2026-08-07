/**
 * Mood Service Tests
 *
 * Unit tests for character mood, happiness meter,
 * and expression modifiers.
 */
import { beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { MoodService, } from "./mood-service";
import { createTestActors, } from "./test-helpers";

describe("MoodService", () => {
  let db: Kysely<DB>;
  let moodService: MoodService;
  let testActorId: string;

  beforeAll(async () => {
    const testDb = await createTestDb();
    db = testDb.db;
    moodService = MoodService(db,);

    const { actorId, } = await createTestActors(db, "test-actor-mood-001",);
    testActorId = actorId;
  },);

  describe("createMood", () => {
    it("should create a mood state with defaults", async () => {
      const moodId = await moodService.createMood({
        actorId: testActorId,
      },);
      expect(moodId,).toBeDefined();
    });
  });

  describe("getMood", () => {
    it("should get mood state for an actor", async () => {
      const mood = await moodService.getMood(testActorId,);
      expect(mood,).toBeDefined();
      expect(mood?.actorId,).toBe(testActorId,);
      expect(mood?.happiness,).toBe(50,);
      expect(mood?.currentMood,).toBe("neutral",);
    });

    it("should return undefined for non-existent mood", async () => {
      const mood = await moodService.getMood("non-existent-actor",);
      expect(mood,).toBeUndefined();
    });
  });

  describe("updateMood", () => {
    it("should update happiness", async () => {
      await moodService.updateMood(testActorId, undefined, {
        happiness: 75,
      },);
      const mood = await moodService.getMood(testActorId,);
      expect(mood?.happiness,).toBe(75,);
    });

    it("should clamp happiness to 0-100", async () => {
      await moodService.updateMood(testActorId, undefined, { happiness: 150, },);
      const mood = await moodService.getMood(testActorId,);
      expect(mood?.happiness,).toBe(100,);

      await moodService.updateMood(testActorId, undefined, { happiness: -20, },);
      const mood2 = await moodService.getMood(testActorId,);
      expect(mood2?.happiness,).toBe(0,);
    });

    it("should update expression modifiers", async () => {
      await moodService.updateMood(testActorId, undefined, {
        expressionModifiers: { tone: 0.8, verbosity: 0.5, },
      },);
      const mood = await moodService.getMood(testActorId,);
      expect(mood?.expressionModifiers.tone ?? 0,).toBeGreaterThan(0.79,);
      expect(mood?.expressionModifiers.tone ?? 0,).toBeLessThan(0.81,);
    });
  });

  describe("applyHappinessDelta", () => {
    it("should apply positive delta (modified by stability)", async () => {
      // Set stability to 0 so delta is applied fully
      await moodService.updateMood(testActorId, undefined, { happiness: 50, moodStability: 0, },);
      await moodService.applyHappinessDelta(testActorId, undefined, 20,);
      const mood = await moodService.getMood(testActorId,);
      expect(mood?.happiness,).toBe(70,);
    });

    it("should apply negative delta (modified by stability)", async () => {
      await moodService.updateMood(testActorId, undefined, { happiness: 50, moodStability: 0, },);
      await moodService.applyHappinessDelta(testActorId, undefined, -30,);
      const mood = await moodService.getMood(testActorId,);
      expect(mood?.happiness,).toBe(20,);
    });

    it("should clamp after delta", async () => {
      await moodService.updateMood(testActorId, undefined, { happiness: 90, moodStability: 0, },);
      await moodService.applyHappinessDelta(testActorId, undefined, 20,);
      const mood = await moodService.getMood(testActorId,);
      expect(mood?.happiness,).toBe(100,);
    });

    it("should reduce delta with high stability", async () => {
      await moodService.updateMood(testActorId, undefined, { happiness: 50, moodStability: 1, },);
      await moodService.applyHappinessDelta(testActorId, undefined, 20,);
      const mood = await moodService.getMood(testActorId,);
      // With stability=1, effective delta = 20 * (1 - 1*0.5) = 10
      expect(mood?.happiness,).toBe(60,);
    });
  });

  describe("logEvent", () => {
    it("should log a mood event", async () => {
      const eventId = await moodService.logEvent({
        actorId: testActorId,
        eventType: "quest_completed",
        happinessDelta: 15,
        source: "quest",
        sourceId: "quest-001",
      },);
      expect(eventId,).toBeDefined();
    });

    it("should get recent events", async () => {
      const events = await moodService.getEvents(testActorId, undefined, 10,);
      expect(events.length,).toBeGreaterThanOrEqual(1,);
    });
  });
});

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

  describe("updateMood last_mood_change", () => {
    it("bumps last_mood_change only on an actual category change", async () => {
      const { actorId, } = await createTestActors(db, "test-actor-mood-lastchange-001",);
      await moodService.createMood({ actorId, },);

      const created = await moodService.getMood(actorId,);
      expect(created?.happiness,).toBe(50,);
      expect(created?.currentMood,).toBe("neutral",);
      const createdAt = created?.lastMoodChange;

      // Same-category happiness nudge (still the neutral band): not a change.
      await new Promise((resolve,) => setTimeout(resolve, 5,));
      await moodService.updateMood(actorId, undefined, { happiness: 55, },);
      const nudged = await moodService.getMood(actorId,);
      expect(nudged?.happiness,).toBe(55,);
      expect(nudged?.lastMoodChange,).toBe(createdAt,);

      // Same-label rewrite — what every production caller does — is not a
      // category change either.
      await new Promise((resolve,) => setTimeout(resolve, 5,));
      await moodService.updateMood(actorId, undefined, { happiness: 55, currentMood: "neutral", },);
      const rewritten = await moodService.getMood(actorId,);
      expect(rewritten?.lastMoodChange,).toBe(createdAt,);

      // Category flip: the mood really changed, so the timestamp moves.
      await new Promise((resolve,) => setTimeout(resolve, 5,));
      await moodService.updateMood(actorId, undefined, { happiness: 85, currentMood: "ecstatic", },);
      const flipped = await moodService.getMood(actorId,);
      expect(flipped?.currentMood,).toBe("ecstatic",);
      expect(flipped?.lastMoodChange,).not.toBe(createdAt,);
    });

    it("bumps last_mood_change when a happiness nudge crosses a band", async () => {
      const { actorId, } = await createTestActors(db, "test-actor-mood-bandcross-001",);
      await moodService.createMood({ actorId, },);

      const created = await moodService.getMood(actorId,);
      expect(created?.happiness,).toBe(50,);
      expect(created?.currentMood,).toBe("neutral",);
      const createdAt = created?.lastMoodChange;

      // 50 -> 85 crosses neutral -> ecstatic. No currentMood is passed, so
      // only the happiness band can be responsible for the bump.
      await new Promise((resolve,) => setTimeout(resolve, 5,));
      await moodService.updateMood(actorId, undefined, { happiness: 85, },);
      const crossed = await moodService.getMood(actorId,);
      expect(crossed?.happiness,).toBe(85,);
      expect(crossed?.lastMoodChange,).not.toBe(createdAt,);
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

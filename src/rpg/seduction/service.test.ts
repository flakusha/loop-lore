import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, } from "../../test-utils/insert-helpers";
import { SeductionService, } from "./service";

// Initialize logger for tests (error only to suppress noise)
createLogger({ level: "error", },);

// ── Helpers ──────────────────────────────────────────────────

async function seedTestDb(): Promise<Kysely<DB>> {
  const { db, } = await createTestDb();
  await insertActors(db, "Actor 1", { id: "actor-1", } as never,);
  await insertActors(db, "Actor 2", { id: "actor-2", } as never,);
  return db;
}

// ── Tests ────────────────────────────────────────────────────

describe("SeductionService", () => {
  describe("Desire Profile", () => {
    test("getDesireProfile creates default profile", async () => {
      const db = await seedTestDb();
      const service = new SeductionService(db,);

      const profile = await service.getDesireProfile("actor-1",);

      expect(profile.turnOns,).toEqual([],);
      expect(profile.turnOffs,).toEqual([],);
      expect(profile.fetishes,).toEqual([],);
      expect(profile.hardLimits,).toEqual([],);
      expect(profile.currentDesire,).toBe(0,);
    });

    test("updateDesireProfile updates fields", async () => {
      const db = await seedTestDb();
      const service = new SeductionService(db,);

      const success = await service.updateDesireProfile("actor-1", {
        turnOns: ["intelligence", "humor",],
        hardLimits: ["cruelty",],
      },);

      expect(success,).toBe(true,);

      const profile = await service.getDesireProfile("actor-1",);
      expect(profile.turnOns,).toEqual(["intelligence", "humor",],);
      expect(profile.hardLimits,).toEqual(["cruelty",],);
    });
  });

  describe("Seduction Skills", () => {
    test("getSkill creates level 1 skill", async () => {
      const db = await seedTestDb();
      const service = new SeductionService(db,);

      const skill = await service.getSkill("actor-1", "foreplay", "Kissing",);

      expect(skill.level,).toBe(1,);
      expect(skill.xp,).toBe(0,);
      expect(skill.category,).toBe("foreplay",);
    });

    test("awardXp levels up when threshold reached", async () => {
      const db = await seedTestDb();
      const service = new SeductionService(db,);

      await service.getSkill("actor-1", "foreplay", "Kissing",);
      const result = await service.awardXp("actor-1", "foreplay", "Kissing", 55,);

      expect(result.leveled,).toBe(true,);
      expect(result.newLevel,).toBe(2,);
    });

    test("awardXp doesn't level up below threshold", async () => {
      const db = await seedTestDb();
      const service = new SeductionService(db,);

      await service.getSkill("actor-1", "foreplay", "Kissing",);
      const result = await service.awardXp("actor-1", "foreplay", "Kissing", 10,);

      expect(result.leveled,).toBe(false,);
      expect(result.newLevel,).toBe(1,);
    });
  });

  describe("Arousal State", () => {
    test("getArousal creates default state", async () => {
      const db = await seedTestDb();
      const service = new SeductionService(db,);

      const arousal = await service.getArousal("actor-1",);

      expect(arousal.level,).toBe(0,);
      expect(arousal.buildupRate,).toBe(1,);
      expect(arousal.decayRate,).toBe(1,);
    });

    test("modifyArousal increases level", async () => {
      const db = await seedTestDb();
      const service = new SeductionService(db,);

      const newLevel = await service.modifyArousal("actor-1", 20,);

      expect(newLevel,).toBe(20,);
    });

    test("modifyArousal clamps to 0-100", async () => {
      const db = await seedTestDb();
      const service = new SeductionService(db,);

      const newLevel = await service.modifyArousal("actor-1", 150,);

      expect(newLevel,).toBe(100,);
    });

    test("decayArousal reduces level", async () => {
      const db = await seedTestDb();
      const service = new SeductionService(db,);

      await service.modifyArousal("actor-1", 50,);
      const newLevel = await service.decayArousal("actor-1",);

      expect(newLevel,).toBeLessThan(50,);
    });
  });
});

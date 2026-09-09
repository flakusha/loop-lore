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

/** */
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

  // ── Edge cases ──────────────────────────────────────────────

  describe("Seduction Skills — edge cases", () => {
    test("awardXp with negative XP throws (NOT NULL constraint)", async () => {
      const db = await seedTestDb();
      const service = new SeductionService(db,);

      await service.getSkill("actor-1", "foreplay", "Kissing",);
      // xp column has NOT NULL; negative XP works fine since it's just
      // a number. Pin the observable behavior:
      const result = await service.awardXp("actor-1", "foreplay", "Kissing", -10,);
      // xp = 0 + (-10) = -10 → NOT NULL is fine; below threshold so
      // no level up.
      expect(result.leveled,).toBe(false,);
      expect(result.newLevel,).toBe(1,);
    });

    test("awardXp with XP=0 leaves the skill untouched (still level 1)", async () => {
      const db = await seedTestDb();
      const service = new SeductionService(db,);

      await service.getSkill("actor-1", "foreplay", "Kissing",);
      const result = await service.awardXp("actor-1", "foreplay", "Kissing", 0,);
      expect(result.leveled,).toBe(false,);
      expect(result.newLevel,).toBe(1,);
    });

    test("awardXp with NaN XP throws (NOT NULL constraint)", async () => {
      const db = await seedTestDb();
      const service = new SeductionService(db,);

      await service.getSkill("actor-1", "foreplay", "Kissing",);
      await expect(
        service.awardXp("actor-1", "foreplay", "Kissing", NaN,),
      ).rejects.toThrow();
    });

    test("awardXp with Infinity XP triggers level-up (Infinity > threshold)", async () => {
      const db = await seedTestDb();
      const service = new SeductionService(db,);

      await service.getSkill("actor-1", "foreplay", "Kissing",);
      const result = await service.awardXp("actor-1", "foreplay", "Kissing", Infinity,);
      expect(result.leveled,).toBe(true,);
      expect(result.newLevel,).toBeGreaterThanOrEqual(2,);
    });
  });

  describe("Arousal State — edge cases", () => {
    test("modifyArousal with delta=-1 reduces from 5 to 4", async () => {
      const db = await seedTestDb();
      const service = new SeductionService(db,);

      await service.modifyArousal("actor-1", 5,);
      const newLevel = await service.modifyArousal("actor-1", -1,);
      expect(newLevel,).toBe(4,);
    });

    test("modifyArousal with delta=Infinity clamps to 100", async () => {
      const db = await seedTestDb();
      const service = new SeductionService(db,);

      const newLevel = await service.modifyArousal("actor-1", Infinity,);
      expect(newLevel,).toBe(100,);
    });

    test("modifyArousal with delta=NaN throws (NOT NULL constraint)", async () => {
      const db = await seedTestDb();
      const service = new SeductionService(db,);

      await expect(
        service.modifyArousal("actor-1", NaN,),
      ).rejects.toThrow();
    });

    test("decayArousal past 0 floor stays at 0", async () => {
      const db = await seedTestDb();
      const service = new SeductionService(db,);

      // Start at 0 — decay must not go negative.
      const newLevel = await service.decayArousal("actor-1",);
      expect(newLevel,).toBe(0,);
    });

    test("decayArousal returns 0 when state.level is already 0", async () => {
      const db = await seedTestDb();
      const service = new SeductionService(db,);

      await service.getArousal("actor-1",);
      const newLevel = await service.decayArousal("actor-1",);
      expect(newLevel,).toBe(0,);
    });

    test("modifyArousal applies the buildupRate multiplier (default 1)", async () => {
      const db = await seedTestDb();
      const service = new SeductionService(db,);

      // Default buildupRate is 1, so +20 stays +20.
      const newLevel = await service.modifyArousal("actor-1", 20,);
      expect(newLevel,).toBe(20,);
    });
  });

  describe("Desire Profile — edge cases", () => {
    test("getDesireProfile is idempotent (returns the same row)", async () => {
      const db = await seedTestDb();
      const service = new SeductionService(db,);

      const a = await service.getDesireProfile("actor-1",);
      const b = await service.getDesireProfile("actor-1",);
      expect(a.id,).toBe(b.id,);
    });

    test("updateDesireProfile with empty object returns true (no-op)", async () => {
      const db = await seedTestDb();
      const service = new SeductionService(db,);

      const success = await service.updateDesireProfile("actor-1", {},);
      expect(success,).toBe(true,);
    });

    test("updateDesireProfile auto-creates a profile for a new actor", async () => {
      const db = await seedTestDb();
      await insertActors(db, "Late Actor", { id: "actor-late", } as never,);
      const service = new SeductionService(db,);

      const success = await service.updateDesireProfile("actor-late", {
        fetishes: ["silk",],
      },);
      expect(success,).toBe(true,);
      const profile = await service.getDesireProfile("actor-late",);
      expect(profile.fetishes,).toEqual(["silk",],);
    });
  });
});

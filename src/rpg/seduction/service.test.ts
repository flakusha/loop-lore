import { Database, } from "bun:sqlite";
import { describe, expect, test, } from "bun:test";
import { Kysely, } from "kysely";
import { createSqliteDialect, } from "../../db/index";
import { createLogger, } from "../../logger";
import { SeductionService, } from "./service";

// Initialize logger for tests (error only to suppress noise)
createLogger({ level: "error", },);

// ── Helpers ──────────────────────────────────────────────────

function createTestDb(): Kysely<any> {
  const db = new Database(":memory:");
  const kysely = new Kysely({ dialect: createSqliteDialect(db), });

  // Create minimal schema
  db.exec(`
    CREATE TABLE actors (
      id TEXT PRIMARY KEY,
      content_rating TEXT NOT NULL DEFAULT 'sfw'
    );
    CREATE TABLE character_desire_profile (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL UNIQUE,
      turn_ons TEXT NOT NULL DEFAULT '[]',
      turn_offs TEXT NOT NULL DEFAULT '[]',
      fetishes TEXT NOT NULL DEFAULT '[]',
      hard_limits TEXT NOT NULL DEFAULT '[]',
      current_desire INTEGER NOT NULL DEFAULT 0,
      desire_decay_rate REAL NOT NULL DEFAULT 1,
      desire_buildup_rate REAL NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE character_seduction_skills (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      skill_category TEXT NOT NULL,
      skill_name TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      xp INTEGER NOT NULL DEFAULT 0,
      xp_to_next INTEGER NOT NULL DEFAULT 50,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(actor_id, skill_category, skill_name)
    );
    CREATE TABLE character_arousal (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      world_id TEXT,
      level INTEGER NOT NULL DEFAULT 0,
      buildup_rate REAL NOT NULL DEFAULT 1,
      decay_rate REAL NOT NULL DEFAULT 1,
      modifiers TEXT NOT NULL DEFAULT '[]',
      last_update TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(actor_id, world_id)
    );
    INSERT INTO actors (id) VALUES ('actor-1'), ('actor-2');
  `);

  return kysely;
}

// ── Tests ────────────────────────────────────────────────────

describe("SeductionService", () => {
  describe("Desire Profile", () => {
    test("getDesireProfile creates default profile", async () => {
      const db = createTestDb();
      const service = new SeductionService(db,);

      const profile = await service.getDesireProfile("actor-1",);

      expect(profile.turnOns,).toEqual([],);
      expect(profile.turnOffs,).toEqual([],);
      expect(profile.fetishes,).toEqual([],);
      expect(profile.hardLimits,).toEqual([],);
      expect(profile.currentDesire,).toBe(0,);
    });

    test("updateDesireProfile updates fields", async () => {
      const db = createTestDb();
      const service = new SeductionService(db,);

      const success = await service.updateDesireProfile("actor-1", {
        turnOns: ["intelligence", "humor"],
        hardLimits: ["cruelty"],
      });

      expect(success,).toBe(true,);

      const profile = await service.getDesireProfile("actor-1",);
      expect(profile.turnOns,).toEqual(["intelligence", "humor"],);
      expect(profile.hardLimits,).toEqual(["cruelty"],);
    });
  });

  describe("Seduction Skills", () => {
    test("getSkill creates level 1 skill", async () => {
      const db = createTestDb();
      const service = new SeductionService(db,);

      const skill = await service.getSkill("actor-1", "foreplay", "Kissing",);

      expect(skill.level,).toBe(1,);
      expect(skill.xp,).toBe(0,);
      expect(skill.category,).toBe("foreplay",);
    });

    test("awardXp levels up when threshold reached", async () => {
      const db = createTestDb();
      const service = new SeductionService(db,);

      await service.getSkill("actor-1", "foreplay", "Kissing",);
      const result = await service.awardXp("actor-1", "foreplay", "Kissing", 55,);

      expect(result.leveled,).toBe(true,);
      expect(result.newLevel,).toBe(2,);
    });

    test("awardXp doesn't level up below threshold", async () => {
      const db = createTestDb();
      const service = new SeductionService(db,);

      await service.getSkill("actor-1", "foreplay", "Kissing",);
      const result = await service.awardXp("actor-1", "foreplay", "Kissing", 10,);

      expect(result.leveled,).toBe(false,);
      expect(result.newLevel,).toBe(1,);
    });
  });

  describe("Arousal State", () => {
    test("getArousal creates default state", async () => {
      const db = createTestDb();
      const service = new SeductionService(db,);

      const arousal = await service.getArousal("actor-1",);

      expect(arousal.level,).toBe(0,);
      expect(arousal.buildupRate,).toBe(1,);
      expect(arousal.decayRate,).toBe(1,);
    });

    test("modifyArousal increases level", async () => {
      const db = createTestDb();
      const service = new SeductionService(db,);

      const newLevel = await service.modifyArousal("actor-1", 20,);

      expect(newLevel,).toBe(20,);
    });

    test("modifyArousal clamps to 0-100", async () => {
      const db = createTestDb();
      const service = new SeductionService(db,);

      const newLevel = await service.modifyArousal("actor-1", 150,);

      expect(newLevel,).toBe(100,);
    });

    test("decayArousal reduces level", async () => {
      const db = createTestDb();
      const service = new SeductionService(db,);

      await service.modifyArousal("actor-1", 50,);
      const newLevel = await service.decayArousal("actor-1",);

      expect(newLevel,).toBeLessThan(50,);
    });
  });
});

import { Database, } from "bun:sqlite";
import { describe, expect, test, } from "bun:test";
import { Kysely, } from "kysely";
import { HeatPhase, } from "../../db/enums";
import { createSqliteDialect, } from "../../db/index";
import { createLogger, } from "../../logger";
import { Species, } from "./enums";
import { BodySystemService, } from "./service";

// Initialize logger for tests (error only to suppress noise)
createLogger({ level: "error", },);

// ── Helpers ──────────────────────────────────────────────────

function createTestDb(): Kysely<any> {
  const db = new Database(":memory:",);
  const kysely = new Kysely({ dialect: createSqliteDialect(db,), },);

  // Create minimal schema
  db.run(`
    CREATE TABLE actors (
      id TEXT PRIMARY KEY,
      content_rating TEXT NOT NULL DEFAULT 'sfw'
    );
    CREATE TABLE character_body_profile (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL UNIQUE,
      stamina INTEGER NOT NULL DEFAULT 50,
      flexibility INTEGER NOT NULL DEFAULT 50,
      sensitivity INTEGER NOT NULL DEFAULT 50,
      endurance INTEGER NOT NULL DEFAULT 50,
      size_category TEXT NOT NULL DEFAULT 'average',
      build TEXT NOT NULL DEFAULT 'average',
      beauty INTEGER NOT NULL DEFAULT 50,
      charisma INTEGER NOT NULL DEFAULT 50,
      style INTEGER NOT NULL DEFAULT 50,
      scent TEXT,
      modifications TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE character_heat_cycle (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL UNIQUE,
      species TEXT NOT NULL DEFAULT 'human',
      cycle_length_days INTEGER NOT NULL DEFAULT 0,
      current_phase TEXT NOT NULL DEFAULT 'normal',
      days_until_next_heat INTEGER NOT NULL DEFAULT 0,
      effects TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO actors (id) VALUES ('actor-1');
  `,);

  return kysely;
}

// ── Tests ────────────────────────────────────────────────────

describe("BodySystemService", () => {
  describe("Body Profile", () => {
    test("getProfile creates default profile", async () => {
      const db = createTestDb();
      const service = new BodySystemService(db,);

      const profile = await service.getProfile("actor-1",);

      expect(profile.stamina,).toBe(50,);
      expect(profile.flexibility,).toBe(50,);
      expect(profile.sensitivity,).toBe(50,);
      expect(profile.endurance,).toBe(50,);
      expect(profile.sizeCategory,).toBe("average",);
      expect(profile.build,).toBe("average",);
      expect(profile.modifications,).toEqual([],);
    });

    test("updateProfile updates fields", async () => {
      const db = createTestDb();
      const service = new BodySystemService(db,);

      const success = await service.updateProfile("actor-1", {
        stamina: 75,
        build: "athletic",
        beauty: 80,
      },);

      expect(success,).toBe(true,);

      const profile = await service.getProfile("actor-1",);
      expect(profile.stamina,).toBe(75,);
      expect(profile.build,).toBe("athletic",);
      expect(profile.beauty,).toBe(80,);
    });

    test("updateProfile clamps values to 1-100", async () => {
      const db = createTestDb();
      const service = new BodySystemService(db,);

      await service.updateProfile("actor-1", {
        stamina: 150,
        flexibility: -10,
      },);

      const profile = await service.getProfile("actor-1",);
      expect(profile.stamina,).toBe(100,);
      expect(profile.flexibility,).toBe(1,);
    });

    test("addModification adds to list", async () => {
      const db = createTestDb();
      const service = new BodySystemService(db,);

      await service.addModification("actor-1", {
        type: "piercing",
        location: "navel",
        visibility: "visible",
        attractivenessModifier: 5,
        intimidationModifier: 0,
        fetishAppeal: ["navel",],
      },);

      const profile = await service.getProfile("actor-1",);
      expect(profile.modifications,).toHaveLength(1,);
      expect(profile.modifications[0]!.type,).toBe("piercing",);
    });

    test("removeModification removes by index", async () => {
      const db = createTestDb();
      const service = new BodySystemService(db,);

      await service.addModification("actor-1", {
        type: "piercing",
        location: "navel",
        visibility: "visible",
        attractivenessModifier: 5,
        intimidationModifier: 0,
        fetishAppeal: [],
      },);

      const success = await service.removeModification("actor-1", 0,);
      expect(success,).toBe(true,);

      const profile = await service.getProfile("actor-1",);
      expect(profile.modifications,).toEqual([],);
    });
  });

  describe("Heat Cycle", () => {
    test("getHeatCycle creates default for human", async () => {
      const db = createTestDb();
      const service = new BodySystemService(db,);

      const cycle = await service.getHeatCycle("actor-1", Species.Human,);

      expect(cycle.species,).toBe(Species.Human,);
      expect(cycle.cycleLengthDays,).toBe(0,);
      expect(cycle.currentPhase,).toBe(HeatPhase.Normal,);
    });

    test("getHeatCycle creates default for non-human", async () => {
      const db = createTestDb();
      const service = new BodySystemService(db,);

      const cycle = await service.getHeatCycle("actor-1", "catgirl",);

      expect(cycle.species,).toBe("catgirl",);
      expect(cycle.cycleLengthDays,).toBe(30,);
    });

    test("getHeatEffects returns null effects for non-heat phase", async () => {
      const db = createTestDb();
      const service = new BodySystemService(db,);

      const effects = await service.getHeatEffects("actor-1",);

      expect(effects.arousalMultiplier,).toBe(1,);
      expect(effects.fertilityBoost,).toBe(1,);
    });
  });

  describe("Derived Stats", () => {
    test("calculateEncounterDuration uses stamina + endurance", () => {
      const profile = {
        stamina: 70,
        endurance: 60,
      } as any;

      const duration = BodySystemService.calculateEncounterDuration(profile,);
      expect(duration,).toBe(13,);
    });

    test("calculateAvailableActions uses flexibility + build", () => {
      const athletic = { flexibility: 80, build: "athletic", } as any;
      const heavy = { flexibility: 80, build: "heavy", } as any;

      expect(BodySystemService.calculateAvailableActions(athletic,),).toBe(10,);
      expect(BodySystemService.calculateAvailableActions(heavy,),).toBe(7,);
    });

    test("calculateArousalModifier uses sensitivity", () => {
      const low = { sensitivity: 20, } as any;
      const high = { sensitivity: 80, } as any;

      expect(BodySystemService.calculateArousalModifier(low,),).toBeLessThan(1,);
      expect(BodySystemService.calculateArousalModifier(high,),).toBeGreaterThan(1,);
    });
  });
});

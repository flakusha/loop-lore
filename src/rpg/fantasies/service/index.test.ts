import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, resetTestDb, } from "../../../test-utils/create-test-db";
import { insertActors, insertCharacterMood, } from "../../../test-utils/insert-helpers";
import { FantasyService, } from "./index";

createLogger({ level: "error", },);

let db: Kysely<DB>;
let sqlite: Database;

beforeAll(async () => {
  const testDb = await createTestDb();
  db = testDb.db;
  sqlite = testDb.sqlite;
},);

afterAll(async () => {
  await db.destroy();
},);

beforeEach(async () => {
  resetTestDb(sqlite,);
  await insertActors(db, "Hero", { id: "actor-hero", },);
  await insertActors(db, "Rival", { id: "actor-rival", },);
},);

describe("FantasyService", () => {
  test("createFantasy applies defaults and round-trips", async () => {
    const service = new FantasyService(db,);
    const fantasy = await service.createFantasy({
      database: db,
      actorId: "actor-hero",
      name: "Moonlit Vow",
      category: "roleplay",
    },);
    expect(fantasy.actorId,).toBe("actor-hero",);
    expect(fantasy.name,).toBe("Moonlit Vow",);
    expect(fantasy.category,).toBe("roleplay",);
    expect(fantasy.intensity,).toBe("mild",);
    expect(fantasy.requirements,).toEqual({
      partnerType: [],
      locationType: [],
      equipment: [],
      minIntimacy: 0,
      minArousal: 0,
    },);
    expect(fantasy.fulfillmentEffects,).toEqual({
      satisfactionBonus: 10,
      intimacyBonus: 3,
      moodBonus: 5,
      memoryStrength: 50,
      repeatDesire: 50,
    },);
    expect(fantasy.risks,).toEqual({
      reputationRisk: 0,
      emotionalRisk: 0,
      physicalRisk: 0,
      discoveryRisk: 0,
    },);
    expect(fantasy.discoveredThrough,).toBeNull();
    expect(fantasy.initialReaction,).toBe("neutral",);
    expect(fantasy.currentFeeling,).toBe("neutral",);
    expect(fantasy.timesExplored,).toBe(0,);

    const stored = await service.getActorFantasies("actor-hero",);
    expect(stored,).toEqual([fantasy,],);
  });

  test("createFantasy merges partial requirements, effects, and risks", async () => {
    const service = new FantasyService(db,);
    const fantasy = await service.createFantasy({
      database: db,
      actorId: "actor-hero",
      name: "Silk Bonds",
      category: "bondage",
      intensity: "intense",
      requirements: { minIntimacy: 40, equipment: ["rope",], },
      fulfillmentEffects: { satisfactionBonus: 25, },
      risks: { emotionalRisk: 30, },
      discoveredThrough: "a daring scene",
      initialReaction: "like",
    },);
    expect(fantasy.intensity,).toBe("intense",);
    expect(fantasy.requirements.minIntimacy,).toBe(40,);
    expect(fantasy.requirements.equipment,).toEqual(["rope",],);
    expect(fantasy.requirements.minArousal,).toBe(0,);
    expect(fantasy.fulfillmentEffects.satisfactionBonus,).toBe(25,);
    expect(fantasy.fulfillmentEffects.moodBonus,).toBe(5,);
    expect(fantasy.risks.emotionalRisk,).toBe(30,);
    expect(fantasy.risks.physicalRisk,).toBe(0,);
    expect(fantasy.discoveredThrough,).toBe("a daring scene",);
    expect(fantasy.initialReaction,).toBe("like",);
    expect(fantasy.currentFeeling,).toBe("like",);
  });

  test("getActorFantasies returns empty list for an actor with none", async () => {
    const service = new FantasyService(db,);
    expect(await service.getActorFantasies("actor-hero",),).toEqual([],);
  });

  test("getActorFantasies orders by category then name", async () => {
    const service = new FantasyService(db,);
    for (const name of ["Zebra", "Apple",]) {
      await service.createFantasy({
        database: db,
        actorId: "actor-hero",
        name,
        category: "roleplay",
      },);
    }
    await service.createFantasy({
      database: db,
      actorId: "actor-hero",
      name: "Mango",
      category: "bondage",
    },);
    const names = (await service.getActorFantasies("actor-hero",)).map((f,) => f.name);
    expect(names,).toEqual(["Mango", "Apple", "Zebra",],);
  });

  test("getByCategory filters to the category", async () => {
    const service = new FantasyService(db,);
    await service.createFantasy({
      database: db,
      actorId: "actor-hero",
      name: "Silk Bonds",
      category: "bondage",
    },);
    await service.createFantasy({
      database: db,
      actorId: "actor-hero",
      name: "Moonlit Vow",
      category: "roleplay",
    },);
    const bondage = await service.getByCategory("actor-hero", "bondage",);
    expect(bondage.map((f,) => f.name),).toEqual(["Silk Bonds",],);
    expect(await service.getByCategory("actor-hero", "praise",),).toEqual([],);
  });

  test("recordExploration counts explorations and updates feeling", async () => {
    const service = new FantasyService(db,);
    const fantasy = await service.createFantasy({
      database: db,
      actorId: "actor-hero",
      name: "Moonlit Vow",
      category: "roleplay",
    },);
    expect(await service.recordExploration(fantasy.id,),).toBeTrue();
    expect(await service.recordExploration(fantasy.id, "love",),).toBeTrue();
    const [stored,] = await service.getActorFantasies("actor-hero",);
    expect(stored?.timesExplored,).toBe(2,);
    expect(stored?.currentFeeling,).toBe("love",);
  });

  test("recordExploration without a feeling keeps the current feeling", async () => {
    const service = new FantasyService(db,);
    const fantasy = await service.createFantasy({
      database: db,
      actorId: "actor-hero",
      name: "Moonlit Vow",
      category: "roleplay",
    },);
    expect(await service.recordExploration(fantasy.id,),).toBeTrue();
    const [stored,] = await service.getActorFantasies("actor-hero",);
    expect(stored?.timesExplored,).toBe(1,);
    expect(stored?.currentFeeling,).toBe("neutral",);
  });

  test("recordExploration on a missing fantasy returns false", async () => {
    const service = new FantasyService(db,);
    expect(await service.recordExploration("fantasy-missing",),).toBeFalse();
  });

  test("deleteFantasy removes the fantasy and reports status", async () => {
    const service = new FantasyService(db,);
    const fantasy = await service.createFantasy({
      database: db,
      actorId: "actor-hero",
      name: "Moonlit Vow",
      category: "roleplay",
    },);
    expect(await service.deleteFantasy(fantasy.id,),).toBeTrue();
    expect(await service.getActorFantasies("actor-hero",),).toEqual([],);
    expect(await service.deleteFantasy(fantasy.id,),).toBeFalse();
    expect(await service.deleteFantasy("fantasy-missing",),).toBeFalse();
  });

  test("attemptDiscovery through the service discovers and persists", async () => {
    const service = new FantasyService(db,);
    const result = await service.attemptDiscovery(
      "actor-hero",
      "mystical moonlit bondage ritual tonight",
      1,
    );
    expect(result.discovered,).toBeTrue();
    expect(result.fantasy?.name,).toBe("Mystical moonlit bondage",);
    expect(result.fantasy?.category,).toBe("bondage",);
    const stored = await service.getByCategory("actor-hero", "bondage",);
    expect(stored.map((f,) => f.name),).toEqual(["Mystical moonlit bondage",],);
  });

  test("attemptDiscovery through the service reports already-known", async () => {
    const service = new FantasyService(db,);
    await service.attemptDiscovery("actor-hero", "secret praise ceremony at dawn", 1,);
    const repeat = await service.attemptDiscovery(
      "actor-hero",
      "secret praise ceremony at dawn",
      1,
    );
    expect(repeat,).toEqual({ discovered: false, reason: "Already known", },);
  });
});

describe("fulfill (TASK-037)", () => {
  const NOW = "2026-01-01T00:00:00.000Z";

  test("fulfill applies mood leg, counts exploration, returns effects", async () => {
    const service = new FantasyService(db,);
    await insertCharacterMood(db, "actor-hero", NOW, NOW, NOW,);
    const fantasy = await service.createFantasy({
      database: db,
      actorId: "actor-hero",
      name: "Moonlit Vow",
      category: "roleplay",
    },);
    // Default effects: intimacyBonus 3, moodBonus 5.
    const effects = await service.fulfill(fantasy.id,);
    expect(effects?.intimacyBonus,).toBe(3,);
    expect(effects?.moodBonus,).toBe(5,);
    // Exploration counted.
    const [stored,] = await service.getActorFantasies("actor-hero",);
    expect(stored?.timesExplored,).toBe(1,);
    // Mood leg: one fantasy.fulfilled event on the owner (self-target).
    const events = await db.selectFrom("mood_events",)
      .where("actor_id", "=", "actor-hero",)
      .selectAll()
      .execute();
    expect(events.length,).toBe(1,);
    expect(events[0]!.event_type,).toBe("fantasy.fulfilled",);
    expect(events[0]!.source,).toBe("fantasy",);
  });

  test("fulfill for a target applies the intimacy pair leg", async () => {
    const service = new FantasyService(db,);
    await insertCharacterMood(db, "actor-rival", NOW, NOW, NOW,);
    const fantasy = await service.createFantasy({
      database: db,
      actorId: "actor-hero",
      name: "Silk Bonds",
      category: "bondage",
      fulfillmentEffects: { intimacyBonus: 8, moodBonus: 4, },
    },);
    const effects = await service.fulfill(fantasy.id, { actorId: "actor-rival", },);
    expect(effects?.intimacyBonus,).toBe(8,);
    // Pair leg: rival → hero pair exists with the +8 delta.
    const pair = await db.selectFrom("character_intimacy",)
      .where("actor_id", "=", "actor-rival",)
      .where("target_actor_id", "=", "actor-hero",)
      .selectAll()
      .executeTakeFirst() ??
      await db.selectFrom("character_intimacy",)
        .where("actor_id", "=", "actor-hero",)
        .where("target_actor_id", "=", "actor-rival",)
        .selectAll()
        .executeTakeFirst();
    expect(pair?.score,).toBe(8,);
    // Mood leg lands on the target, not the owner.
    const events = await db.selectFrom("mood_events",)
      .where("actor_id", "=", "actor-rival",)
      .selectAll()
      .execute();
    expect(events.length,).toBe(1,);
    expect(events[0]!.event_type,).toBe("fantasy.fulfilled",);
  });

  test("fulfill on a missing fantasy returns null", async () => {
    const service = new FantasyService(db,);
    expect(await service.fulfill("fantasy-missing",),).toBeNull();
  });

  test("fulfill with zero bonuses writes no mood row and still counts", async () => {
    const service = new FantasyService(db,);
    const fantasy = await service.createFantasy({
      database: db,
      actorId: "actor-hero",
      name: "Quiet Tea",
      category: "service",
      fulfillmentEffects: { intimacyBonus: 0, moodBonus: 0, },
    },);
    expect(await service.fulfill(fantasy.id,),).not.toBeNull();
    expect(
      await db.selectFrom("mood_events",).selectAll().execute(),
    ).toEqual([],);
    const [stored,] = await service.getActorFantasies("actor-hero",);
    expect(stored?.timesExplored,).toBe(1,);
  });
});

describe("mood wrapper (TASK-041)", () => {
  const NOW = "2026-01-01T00:00:00.000Z";

  test("getMood returns the Character Core shape", async () => {
    const service = new FantasyService(db,);
    await insertCharacterMood(db, "actor-hero", NOW, NOW, NOW, { happiness: 42, },);
    const mood = await service.getMood("actor-hero",);
    expect(mood?.happiness,).toBe(42,);
    expect(mood?.actorId,).toBe("actor-hero",);
  });

  test("getMood returns undefined when no mood row exists", async () => {
    const service = new FantasyService(db,);
    expect(await service.getMood("actor-hero",),).toBeUndefined();
  });

  test("applyDelta logs a namespaced source-tagged event", async () => {
    const service = new FantasyService(db,);
    await insertCharacterMood(db, "actor-hero", NOW, NOW, NOW,);
    const id = await service.applyDelta("actor-hero", "encounter.completed", 5,);
    expect(typeof id,).toBe("string",);
    const events = await db.selectFrom("mood_events",)
      .where("actor_id", "=", "actor-hero",)
      .selectAll()
      .execute();
    expect(events.length,).toBe(1,);
    expect(events[0]!.event_type,).toBe("encounter.completed",);
    expect(events[0]!.source,).toBe("nsfw",);
    expect(events[0]!.happiness_delta,).toBe(5,);
  });
});

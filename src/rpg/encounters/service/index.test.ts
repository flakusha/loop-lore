import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, resetTestDb, } from "../../../test-utils/create-test-db";
import { insertUsers, insertWorlds, } from "../../../test-utils/insert-helpers";
import { EncounterService, } from "./index";

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
  await insertUsers(db, "owner", "Owner", { id: "user-owner", },);
  await insertWorlds(db, "user-owner", "World", { id: "world-1", },);
},);

describe("EncounterService", () => {
  test("createEncounter applies defaults and round-trips", async () => {
    const service = new EncounterService(db,);
    const encounter = await service.createEncounter({
      database: db,
      encounterType: "romantic",
      participants: ["actor-1", "actor-2",],
    },);
    expect(encounter.encounterType,).toBe("romantic",);
    expect(encounter.intensity,).toBe("vanilla",);
    expect(encounter.narrativeStyle,).toBe("fade_to_black",);
    expect(encounter.participants,).toEqual(["actor-1", "actor-2",],);
    expect(encounter.phases.map((p,) => p.name),).toEqual([
      "Foreplay",
      "Main",
      "Aftercare",
    ],);
    expect(encounter.currentPhase,).toBe(0,);
    expect(encounter.outcomes.length,).toBe(3,);
    expect(encounter.contentTags,).toEqual([],);
    expect(encounter.status,).toBe("active",);
    expect(encounter.completed,).toBeFalse();
    expect(encounter.worldId,).toBeNull();
  });

  test("createEncounter stores world, options, and custom content", async () => {
    const service = new EncounterService(db,);
    const encounter = await service.createEncounter({
      database: db,
      worldId: "world-1",
      encounterType: "experimental",
      intensity: "moderate",
      narrativeStyle: "explicit",
      participants: ["actor-1",],
      phases: [{
        name: "Solo",
        duration: 1,
        actionsAvailable: ["teasing",],
        arousalEffects: [{ target: "self", amount: 5, },],
        narrativeBeats: ["Begin.",],
      },],
      outcomes: [{
        type: "bonding",
        probability: 1,
        effects: {
          intimacyChange: 10,
          moodChange: 5,
          satisfactionBonus: 5,
          memoryCreated: true,
          reputationChange: 0,
        },
      },],
      contentTags: ["tender",],
    },);
    expect(encounter.worldId,).toBe("world-1",);
    expect(encounter.intensity,).toBe("moderate",);
    expect(encounter.narrativeStyle,).toBe("explicit",);
    expect(encounter.phases.map((p,) => p.name),).toEqual(["Solo",],);
    expect(encounter.outcomes.map((o,) => o.type),).toEqual(["bonding",],);
    expect(encounter.contentTags,).toEqual(["tender",],);

    const fetched = await service.getEncounter(encounter.id,);
    expect(fetched,).toEqual(encounter,);
  });

  test("getEncounter returns null for an unknown id", async () => {
    const service = new EncounterService(db,);
    expect(await service.getEncounter("encounter-missing",),).toBeNull();
  });

  test("listEncounters returns empty list when the world has none", async () => {
    const service = new EncounterService(db,);
    expect(await service.listEncounters("world-1",),).toEqual([],);
  });

  test("listEncounters scopes by world and filters by type", async () => {
    const service = new EncounterService(db,);
    await service.createEncounter({
      database: db,
      worldId: "world-1",
      encounterType: "romantic",
      participants: ["actor-1",],
    },);
    await service.createEncounter({
      database: db,
      worldId: "world-1",
      encounterType: "group",
      participants: ["actor-1",],
    },);
    await service.createEncounter({
      database: db,
      encounterType: "romantic",
      participants: ["actor-1",],
    },);
    expect((await service.listEncounters("world-1",)).length,).toBe(2,);
    const romantic = await service.listEncounters("world-1", { type: "romantic", },);
    expect(romantic.length,).toBe(1,);
    expect(romantic[0]?.encounterType,).toBe("romantic",);
  });

  test("listEncounters filters by completion", async () => {
    const service = new EncounterService(db,);
    const finishing = await service.createEncounter({
      database: db,
      worldId: "world-1",
      encounterType: "tender",
      participants: ["actor-1",],
      phases: [{
        name: "Only",
        duration: 1,
        actionsAvailable: ["all",],
        arousalEffects: [],
        narrativeBeats: [],
      },],
      outcomes: [],
    },);
    await service.createEncounter({
      database: db,
      worldId: "world-1",
      encounterType: "tender",
      participants: ["actor-1",],
    },);
    await service.advancePhase(finishing.id,);
    expect(
      (await service.listEncounters("world-1", { completed: true, },)).map((e,) => e.id),
    ).toEqual([finishing.id,],);
    expect((await service.listEncounters("world-1", { completed: false, },)).length,).toBe(1,);
  });

  test("advancePhase steps through each phase in order", async () => {
    const service = new EncounterService(db,);
    const encounter = await service.createEncounter({
      database: db,
      encounterType: "romantic",
      participants: ["actor-1",],
    },);
    const first = await service.advancePhase(encounter.id,);
    expect(first.complete,).toBeFalse();
    expect(first.phaseIndex,).toBe(1,);
    expect(first.phase?.name,).toBe("Main",);
    expect(first.triggeredOutcomes,).toEqual([],);
    const second = await service.advancePhase(encounter.id,);
    expect(second.complete,).toBeFalse();
    expect(second.phaseIndex,).toBe(2,);
    expect(second.phase?.name,).toBe("Aftercare",);
  });

  test("advancePhase completes with guaranteed outcomes and marks completion", async () => {
    const service = new EncounterService(db,);
    const encounter = await service.createEncounter({
      database: db,
      encounterType: "tender",
      participants: ["actor-1",],
      phases: [{
        name: "Only",
        duration: 1,
        actionsAvailable: ["all",],
        arousalEffects: [],
        narrativeBeats: [],
      },],
      outcomes: [
        {
          type: "satisfaction",
          probability: 1,
          effects: {
            intimacyChange: 5,
            moodChange: 10,
            satisfactionBonus: 15,
            memoryCreated: true,
            reputationChange: 0,
          },
        },
        {
          type: "dissatisfaction",
          probability: 0,
          effects: {
            intimacyChange: -2,
            moodChange: -5,
            satisfactionBonus: 0,
            memoryCreated: true,
            reputationChange: 0,
          },
        },
      ],
    },);
    const result = await service.advancePhase(encounter.id,);
    expect(result.complete,).toBeTrue();
    expect(result.phaseIndex,).toBe(1,);
    expect(result.phase,).toBeNull();
    expect(result.triggeredOutcomes.map((o,) => o.type),).toEqual(["satisfaction",],);
    const finished = await service.getEncounter(encounter.id,);
    expect(finished?.status,).toBe("completed",);
    expect(finished?.completed,).toBeTrue();
  });

  test("advancePhase with impossible outcomes completes empty", async () => {
    const service = new EncounterService(db,);
    const encounter = await service.createEncounter({
      database: db,
      encounterType: "tender",
      participants: ["actor-1",],
      phases: [{
        name: "Only",
        duration: 1,
        actionsAvailable: ["all",],
        arousalEffects: [],
        narrativeBeats: [],
      },],
      outcomes: [{
        type: "bonding",
        probability: 0,
        effects: {
          intimacyChange: 10,
          moodChange: 15,
          satisfactionBonus: 20,
          memoryCreated: true,
          reputationChange: 0,
        },
      },],
    },);
    const result = await service.advancePhase(encounter.id,);
    expect(result.complete,).toBeTrue();
    expect(result.triggeredOutcomes,).toEqual([],);
  });

  test("advancePhase on an unknown id returns the empty-complete result", async () => {
    const service = new EncounterService(db,);
    expect(await service.advancePhase("encounter-missing",),).toEqual({
      complete: true,
      phaseIndex: 0,
      phase: null,
      triggeredOutcomes: [],
    },);
  });

  test("deleteEncounter removes the encounter and reports status", async () => {
    const service = new EncounterService(db,);
    const encounter = await service.createEncounter({
      database: db,
      encounterType: "romantic",
      participants: ["actor-1",],
    },);
    expect(await service.deleteEncounter(encounter.id,),).toBeTrue();
    expect(await service.getEncounter(encounter.id,),).toBeNull();
    expect(await service.deleteEncounter(encounter.id,),).toBeFalse();
    expect(await service.deleteEncounter("encounter-missing",),).toBeFalse();
  });
});

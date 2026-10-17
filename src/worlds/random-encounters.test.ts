// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/random-encounters.test.ts — the generic encounter engine (059).
 *
 * Pins the determinism (same seed, same pick), the cooldown window, the
 * chance gate that writes NO ledger row on a miss, pool scoping by travel
 * phase and world, and the cross-world isolation of the outcome write.
 *
 * RESOURCE CONTRACT: `createTestDb()` mints a private in-memory database
 * per test and `destroyTestDb` closes both handles, so every test passes
 * alone and in any order with nothing shared to serialize against.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { createTestDb, destroyTestDb, type TestDb, } from "../test-utils/create-test-db";
import { insertEncounterTemplates, insertUsers, insertWorlds, } from "../test-utils/insert-helpers";
import { buildEncounterContext, } from "./encounter-context";
import { ROLL_REASONS, } from "./encounter-types";
import { EncounterError, recordEncounterOutcome, rollEncounter, } from "./random-encounters";

let fixture: TestDb;
let now: Date;

beforeEach(async () => {
  fixture = await createTestDb();
  await insertUsers(fixture.db, "owner", "Owner", { id: "user-owner", },);
  await insertWorlds(fixture.db, "user-owner", "Test World", { id: "w1", },);
  await insertUsers(fixture.db, "other", "Other", { id: "user-other", },);
  await insertWorlds(fixture.db, "user-other", "Other World", { id: "w2", },);
  now = new Date(Date.UTC(2026, 0, 1,),);
},);

afterEach(async () => {
  await destroyTestDb(fixture,);
},);

/** A certain-fire template: chance 1 removes the chance roll from the picture. */
async function certainTemplate(
  name: string,
  opts: Parameters<typeof insertEncounterTemplates>[2] = {},
) {
  return insertEncounterTemplates(fixture.db, name, {
    world_id: "w1",
    trigger_type: "random",
    trigger_chance: 1,
    ...opts,
  },);
}

/** Roll for world w1 with the given seed and trigger. */
function roll(seed: number, nowAt: Date = now,) {
  return rollEncounter({
    db: fixture.db,
    input: { worldId: "w1", triggerType: "random", rngSeed: seed, now: nowAt, },
  },);
}

describe("rollEncounter", () => {
  test("the same seed picks the same template from the same pool", async () => {
    await certainTemplate("Alpha",);
    await certainTemplate("Beta",);
    await certainTemplate("Gamma",);

    const first = await roll(1234,);
    const second = await roll(1234,);

    expect(first.triggered,).toBe(true,);
    expect(first.reason,).toBe(ROLL_REASONS.Triggered,);
    expect(second.template?.id,).toBe(first.template?.id,);
    expect(second.template?.name,).toBe(first.template?.name,);
  });

  test("a cooldown blocks an immediate re-roll, then frees the template", async () => {
    await certainTemplate("Only", { cooldown_seconds: 3600, },);

    expect((await roll(7,)).triggered,).toBe(true,);

    const blocked = await roll(7,);
    expect(blocked.triggered,).toBe(false,);
    expect(blocked.reason,).toBe(ROLL_REASONS.AllOnCooldown,);

    // One second past the cooldown the template is eligible again.
    const afterCooldown = await roll(7, new Date(now.getTime() + 3601_000,),);
    expect(afterCooldown.triggered,).toBe(true,);
  });

  test("a lost chance roll writes no ledger row", async () => {
    await insertEncounterTemplates(fixture.db, "Impossible", {
      world_id: "w1",
      trigger_type: "random",
      trigger_chance: 0,
    },);

    const result = await roll(9,);
    expect(result.triggered,).toBe(false,);
    expect(result.reason,).toBe(ROLL_REASONS.ChanceMissed,);

    const rolls = await fixture.db.selectFrom("encounter_rolls",).selectAll().execute();
    expect(rolls.length,).toBe(0,);
  });

  test("reports an empty pool rather than throwing", async () => {
    const result = await roll(3,);
    expect(result.triggered,).toBe(false,);
    expect(result.reason,).toBe(ROLL_REASONS.NoCandidates,);
  });

  test("throws for an unknown world", async () => {
    await expect(
      rollEncounter({
        db: fixture.db,
        input: { worldId: "ghost", triggerType: "random", rngSeed: 1, now, },
      },),
    ).rejects.toBeInstanceOf(EncounterError,);
  });
});

describe("rollEncounter scoping", () => {
  test("global templates are visible to every world", async () => {
    await insertEncounterTemplates(fixture.db, "Shared", { world_id: null, trigger_chance: 1, },);

    const result = await rollEncounter({
      db: fixture.db,
      input: { worldId: "w2", triggerType: "random", rngSeed: 5, now, },
    },);

    expect(result.triggered,).toBe(true,);
    expect(result.template?.name,).toBe("Shared",);
  });

  test("another world's templates stay out of this world's pool", async () => {
    await insertEncounterTemplates(fixture.db, "Foreign", {
      world_id: "w2",
      trigger_chance: 1,
    },);

    expect((await roll(11,)).reason,).toBe(ROLL_REASONS.NoCandidates,);
  });

  test("a travel phase narrows the pool to templates that match it", async () => {
    await certainTemplate("Anywhere", { trigger_type: "travel_based", },);
    const departureOnly = await certainTemplate("Leaving", {
      trigger_type: "travel_based",
      travel_phase: "departure",
    },);

    const journey = await rollEncounter({
      db: fixture.db,
      input: {
        worldId: "w1",
        triggerType: "travel_based",
        rngSeed: 21,
        now,
        travelPhase: "journey",
      },
    },);

    expect(journey.template?.id,).not.toBe(departureOnly,);
    expect(journey.template?.name,).toBe("Anywhere",);
  });
});

describe("recordEncounterOutcome", () => {
  test("stores the payload and returns the updated row", async () => {
    await certainTemplate("Skirmish",);
    const fired = await roll(31,);
    expect(fired.triggered,).toBe(true,);

    const updated = await recordEncounterOutcome({
      db: fixture.db,
      worldId: "w1",
      rollId: fired.rollId as string,
      outcome: { result: "victory", gold: 25, },
    },);

    expect(updated.outcome,).toBe('{"result":"victory","gold":25}',);
  });

  test("throws for an unknown roll id", async () => {
    await expect(
      recordEncounterOutcome({ db: fixture.db, worldId: "w1", rollId: "nope", outcome: {}, },),
    ).rejects.toBeInstanceOf(EncounterError,);
  });

  test("cannot annotate a roll that belongs to another world", async () => {
    await certainTemplate("Skirmish",);
    const fired = await roll(77,);

    await expect(
      recordEncounterOutcome({
        db: fixture.db,
        worldId: "w2",
        rollId: fired.rollId as string,
        outcome: { result: "stolen", },
      },),
    ).rejects.toBeInstanceOf(EncounterError,);

    const [untouched,] = await fixture.db.selectFrom("encounter_rolls",).selectAll().execute();
    expect(untouched?.outcome,).toBe("{}",);
  });
});

describe("buildEncounterContext", () => {
  test("carries the template's notes and parsed rewards", async () => {
    const templateId = await insertEncounterTemplates(fixture.db, "Ambush", {
      world_id: "w1",
      story_notes: "The grove watches.",
      rewards: '{"gold":10}',
      consequences: '{"injury":true}',
    },);

    const template = await fixture.db
      .selectFrom("encounter_templates",)
      .selectAll()
      .where("id", "=", templateId,)
      .executeTakeFirstOrThrow();

    const context = await buildEncounterContext({
      db: fixture.db,
      worldId: "w1",
      template,
      location: { id: "loc-1", name: "Clearing", },
    },);

    expect(context.storyNotes,).toBe("The grove watches.",);
    expect(context.rewards,).toEqual({ gold: 10, },);
    expect(context.consequences,).toEqual({ injury: true, },);
    expect(context.location.name,).toBe("Clearing",);
    expect(context.recentEvents,).toEqual([],);
  });

  test("falls back to an unnamed location when the roll carried none", async () => {
    const templateId = await insertEncounterTemplates(fixture.db, "Wander", { world_id: "w1", },);
    const template = await fixture.db
      .selectFrom("encounter_templates",)
      .selectAll()
      .where("id", "=", templateId,)
      .executeTakeFirstOrThrow();

    const context = await buildEncounterContext({ db: fixture.db, worldId: "w1", template, },);

    expect(context.location.id,).toBe("",);
    expect(context.storyNotes,).toBe("",);
  });
});

import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, } from "../../test-utils/insert-helpers";
import { INTIMACY_THRESHOLDS, IntimacyService, } from "./service";

// Initialize logger for tests (error only to suppress noise)
createLogger({ level: "error", },);

// ── Helpers ──────────────────────────────────────────────────

/** */
async function seedTestDb(): Promise<Kysely<DB>> {
  const { db, } = await createTestDb();
  await insertActors(db, "Actor 1", { id: "actor-1", } as never,);
  await insertActors(db, "Actor 2", { id: "actor-2", } as never,);
  await insertActors(db, "Actor 3", { id: "actor-3", } as never,);
  return db;
}

// ── Tests ────────────────────────────────────────────────────

describe("IntimacyService", () => {
  test("getPair creates new pair with score 0", async () => {
    const db = await seedTestDb();
    const service = new IntimacyService(db,);

    const pair = await service.getPair("actor-1", "actor-2",);

    expect(pair.score,).toBe(0,);
    expect(pair.actorId,).toBe("actor-1",);
    expect(pair.targetActorId,).toBe("actor-2",);
    expect(pair.actionHistory,).toEqual([],);
    expect(pair.unlockedThresholds,).toEqual([],);
  });

  test("getPair returns existing pair", async () => {
    const db = await seedTestDb();
    const service = new IntimacyService(db,);

    const pair1 = await service.getPair("actor-1", "actor-2",);
    const pair2 = await service.getPair("actor-1", "actor-2",);

    expect(pair1.id,).toBe(pair2.id,);
  });

  test("applyAction increases score", async () => {
    const db = await seedTestDb();
    const service = new IntimacyService(db,);

    const result = await service.applyAction({
      database: db,
      actorId: "actor-1",
      targetActorId: "actor-2",
      action: {
        id: "action-1",
        name: "Gift",
        type: "gift",
        delta: 10,
        minIntimacy: 0,
        requiresConsent: false,
      },
    },);

    expect(result.applied,).toBe(true,);
    expect(result.newScore,).toBe(10,);
    expect(result.actualDelta,).toBe(10,);
  });

  test("applyAction respects minIntimacy", async () => {
    const db = await seedTestDb();
    const service = new IntimacyService(db,);

    const result = await service.applyAction({
      database: db,
      actorId: "actor-1",
      targetActorId: "actor-2",
      action: {
        id: "action-1",
        name: "Kiss",
        type: "physical",
        delta: 5,
        minIntimacy: 25,
        requiresConsent: false,
      },
    },);

    expect(result.applied,).toBe(false,);
    expect(result.reason,).toContain("Intimacy too low",);
  });

  test("applyAction respects relationship allowlist", async () => {
    const db = await seedTestDb();
    const service = new IntimacyService(db,);

    // Create a friendship relationship
    await db.insertInto("character_relationships",).values({
      id: "rel-1",
      actor_id: "actor-1",
      target_actor_id: "actor-2",
      relationship_type: "friend",
      standing: 0,
      trust: 0,
      familiarity: 0,
      is_bidirectional: 0,
      metadata: "{}",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },).execute();

    const result = await service.applyAction({
      database: db,
      actorId: "actor-1",
      targetActorId: "actor-2",
      action: {
        id: "action-1",
        name: "Romantic Gesture",
        type: "verbal",
        delta: 15,
        minIntimacy: 0,
        allowedRelationships: ["romantic",],
        requiresConsent: false,
      },
    },);

    expect(result.applied,).toBe(false,);
    expect(result.reason,).toContain("Relationship type not allowed",);
  });

  test("applyAction fires threshold events", async () => {
    const db = await seedTestDb();
    const service = new IntimacyService(db,);

    // First get pair to create it
    await service.getPair("actor-1", "actor-2",);

    // Apply action that crosses acquaintances threshold (10)
    const result = await service.applyAction({
      database: db,
      actorId: "actor-1",
      targetActorId: "actor-2",
      action: {
        id: "action-1",
        name: "Help",
        type: "service",
        delta: 15,
        minIntimacy: 0,
        requiresConsent: false,
      },
    },);

    expect(result.thresholdsReached.length,).toBeGreaterThan(0,);
    expect(result.thresholdsReached[0]!.level,).toBe(INTIMACY_THRESHOLDS.acquaintances,);
  });

  test("getLevelLabel returns correct labels", () => {
    expect(IntimacyService.getLevelLabel(0,),).toBe("Strangers",);
    expect(IntimacyService.getLevelLabel(15,),).toBe("Acquaintances",);
    expect(IntimacyService.getLevelLabel(30,),).toBe("Friends",);
    expect(IntimacyService.getLevelLabel(45,),).toBe("Close Friends",);
    expect(IntimacyService.getLevelLabel(60,),).toBe("Romantic Interest",);
    expect(IntimacyService.getLevelLabel(75,),).toBe("Dating",);
    expect(IntimacyService.getLevelLabel(90,),).toBe("Intimate",);
    expect(IntimacyService.getLevelLabel(100,),).toBe("Soulbonded",);
  });

  test("decayAll reduces scores", async () => {
    const db = await seedTestDb();
    const service = new IntimacyService(db,);

    // Create pair with score 10
    await service.applyAction({
      database: db,
      actorId: "actor-1",
      targetActorId: "actor-2",
      action: {
        id: "action-1",
        name: "Gift",
        type: "gift",
        delta: 10,
        minIntimacy: 0,
        requiresConsent: false,
      },
    },);

    const affected = await service.decayAll("actor-1", 5,);
    expect(affected,).toBe(1,);

    const pair = await service.getPair("actor-1", "actor-2",);
    expect(pair.score,).toBe(5,);
  });
});

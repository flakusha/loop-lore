import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertCharacterMood, insertCharacterStats, } from "../../test-utils/insert-helpers";
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

  // ── Edge cases ──────────────────────────────────────────────

  test("applyAction with delta=0 leaves score unchanged but records history", async () => {
    const db = await seedTestDb();
    const service = new IntimacyService(db,);

    const result = await service.applyAction({
      database: db,
      actorId: "actor-1",
      targetActorId: "actor-2",
      action: {
        id: "action-1",
        name: "Wave",
        type: "verbal",
        delta: 0,
        minIntimacy: 0,
        requiresConsent: false,
      },
    },);

    expect(result.applied,).toBe(true,);
    expect(result.actualDelta,).toBe(0,);
    expect(result.newScore,).toBe(0,);

    const pair = await service.getPair("actor-1", "actor-2",);
    expect(pair.actionHistory.length,).toBe(1,);
  });

  test("applyAction with negative delta reduces score", async () => {
    const db = await seedTestDb();
    const service = new IntimacyService(db,);

    // First build up some intimacy.
    await service.applyAction({
      database: db,
      actorId: "actor-1",
      targetActorId: "actor-2",
      action: { id: "a1", name: "Gift", type: "gift", delta: 20, minIntimacy: 0, requiresConsent: false, },
    },);

    // Now apply a negative-delta action.
    const result = await service.applyAction({
      database: db,
      actorId: "actor-1",
      targetActorId: "actor-2",
      action: { id: "a2", name: "Betrayal", type: "physical", delta: -10, minIntimacy: 0, requiresConsent: false, },
    },);

    expect(result.applied,).toBe(true,);
    expect(result.newScore,).toBe(10,);
    expect(result.actualDelta,).toBe(-10,);
  });

  test("applyAction clamps score at MAX_SCORE (100) for huge positive delta", async () => {
    const db = await seedTestDb();
    const service = new IntimacyService(db,);

    const result = await service.applyAction({
      database: db,
      actorId: "actor-1",
      targetActorId: "actor-2",
      action: { id: "a1", name: "Mega-gift", type: "gift", delta: 9_999_999, minIntimacy: 0, requiresConsent: false, },
    },);

    expect(result.applied,).toBe(true,);
    expect(result.newScore,).toBe(100,);
    expect(result.actualDelta,).toBe(100,);
  });

  test("applyAction clamps score at MIN_SCORE (0) for huge negative delta", async () => {
    const db = await seedTestDb();
    const service = new IntimacyService(db,);

    // Seed a small score first.
    await service.applyAction({
      database: db,
      actorId: "actor-1",
      targetActorId: "actor-2",
      action: { id: "a0", name: "Warmup", type: "gift", delta: 10, minIntimacy: 0, requiresConsent: false, },
    },);

    const result = await service.applyAction({
      database: db,
      actorId: "actor-1",
      targetActorId: "actor-2",
      action: {
        id: "a1",
        name: "Catastrophe",
        type: "physical",
        delta: -9_999_999,
        minIntimacy: 0,
        requiresConsent: false,
      },
    },);

    expect(result.applied,).toBe(true,);
    expect(result.newScore,).toBe(0,);
    expect(result.actualDelta,).toBe(-10,);
  });

  test("applyAction with Number.MAX_SAFE_INTEGER as delta clamps to MAX_SCORE", async () => {
    const db = await seedTestDb();
    const service = new IntimacyService(db,);

    const result = await service.applyAction({
      database: db,
      actorId: "actor-1",
      targetActorId: "actor-2",
      action: {
        id: "a1",
        name: "MAX",
        type: "gift",
        delta: Number.MAX_SAFE_INTEGER,
        minIntimacy: 0,
        requiresConsent: false,
      },
    },);

    expect(result.newScore,).toBe(100,);
  });

  test("applyAction with NaN delta throws (NOT NULL constraint on score column)", async () => {
    // SQLite coerces JavaScript NaN to NULL; the score column is
    // NOT NULL, so the insert fails. Pin the observable behavior so
    // a future refactor must guard against NaN explicitly.
    const db = await seedTestDb();
    const service = new IntimacyService(db,);

    await expect(
      service.applyAction({
        database: db,
        actorId: "actor-1",
        targetActorId: "actor-2",
        action: { id: "a1", name: "NaN", type: "gift", delta: NaN, minIntimacy: 0, requiresConsent: false, },
      },),
    ).rejects.toThrow();
  });

  test("same-actor self-pair stores a pair with score 0", async () => {
    const db = await seedTestDb();
    const service = new IntimacyService(db,);

    const self = await service.getPair("actor-1", "actor-1",);
    expect(self.actorId,).toBe("actor-1",);
    expect(self.targetActorId,).toBe("actor-1",);
    expect(self.score,).toBe(0,);
  });

  test("action with empty id is still persisted", async () => {
    const db = await seedTestDb();
    const service = new IntimacyService(db,);

    const result = await service.applyAction({
      database: db,
      actorId: "actor-1",
      targetActorId: "actor-2",
      action: { id: "", name: "Empty-id", type: "gift", delta: 5, minIntimacy: 0, requiresConsent: false, },
    },);

    expect(result.applied,).toBe(true,);
    const pair = await service.getPair("actor-1", "actor-2",);
    expect(pair.actionHistory.length,).toBe(1,);
  });

  test("requiresConsent=true does not block the action (consent is caller's responsibility)", async () => {
    const db = await seedTestDb();
    const service = new IntimacyService(db,);

    const result = await service.applyAction({
      database: db,
      actorId: "actor-1",
      targetActorId: "actor-2",
      action: { id: "a1", name: "Consented", type: "physical", delta: 5, minIntimacy: 0, requiresConsent: true, },
    },);

    expect(result.applied,).toBe(true,);
    expect(result.newScore,).toBe(5,);
  });

  test("decayAll returns 0 affected when actor has no pairs", async () => {
    const db = await seedTestDb();
    const service = new IntimacyService(db,);

    const affected = await service.decayAll("actor-3", 5,);
    expect(affected,).toBe(0,);
  });

  test("decayAll skips pairs already at 0", async () => {
    const db = await seedTestDb();
    const service = new IntimacyService(db,);

    await service.getPair("actor-1", "actor-2",);
    const affected = await service.decayAll("actor-1", 5,);
    expect(affected,).toBe(0,);
  });

  test("multiple actor-1 pairs all decay in one call", async () => {
    const db = await seedTestDb();
    const service = new IntimacyService(db,);

    await service.applyAction({
      database: db,
      actorId: "actor-1",
      targetActorId: "actor-2",
      action: { id: "a", name: "Gift", type: "gift", delta: 10, minIntimacy: 0, requiresConsent: false, },
    },);
    await service.applyAction({
      database: db,
      actorId: "actor-1",
      targetActorId: "actor-3",
      action: { id: "a", name: "Gift", type: "gift", delta: 10, minIntimacy: 0, requiresConsent: false, },
    },);

    const affected = await service.decayAll("actor-1", 3,);
    expect(affected,).toBe(2,);
  });

  // ── CHA/WIS scaling (TASK-033) ─────────────────────────────────

  test("applyAction scales positive delta by actor CHA modifier", async () => {
    const db = await seedTestDb();
    const service = new IntimacyService(db,);

    // CHA 18 → +4 modifier (floor((18-10)/2)).
    await insertCharacterStats(db, "actor-1", 10, 10, 10, { cha: 18, },);

    const result = await service.applyAction({
      database: db,
      actorId: "actor-1",
      targetActorId: "actor-2",
      action: { id: "a1", name: "Gift", type: "gift", delta: 10, minIntimacy: 0, requiresConsent: false, },
    },);

    expect(result.applied,).toBe(true,);
    expect(result.newScore,).toBe(14,);
    expect(result.actualDelta,).toBe(14,);
  });

  test("applyAction without a stats row uses neutral (all-10) modifiers", async () => {
    const db = await seedTestDb();
    const service = new IntimacyService(db,);

    const result = await service.applyAction({
      database: db,
      actorId: "actor-1",
      targetActorId: "actor-2",
      action: { id: "a1", name: "Gift", type: "gift", delta: 10, minIntimacy: 0, requiresConsent: false, },
    },);

    expect(result.applied,).toBe(true,);
    expect(result.newScore,).toBe(10,);
  });

  test("applyAction tempers negative delta by actor WIS (never amplifies loss above base)", async () => {
    const db = await seedTestDb();
    const service = new IntimacyService(db,);

    // Build score first (no stats row yet → neutral).
    await service.applyAction({
      database: db,
      actorId: "actor-1",
      targetActorId: "actor-2",
      action: { id: "a0", name: "Warmup", type: "gift", delta: 20, minIntimacy: 0, requiresConsent: false, },
    },);

    // WIS 18 → +4, but loss must not exceed the base delta magnitude (-10).
    await insertCharacterStats(db, "actor-1", 10, 10, 10, { wis: 18, cha: 10, },);

    const result = await service.applyAction({
      database: db,
      actorId: "actor-1",
      targetActorId: "actor-2",
      action: { id: "a2", name: "Betrayal", type: "physical", delta: -10, minIntimacy: 0, requiresConsent: false, },
    },);

    expect(result.applied,).toBe(true,);
    expect(result.newScore,).toBe(10,);
    expect(result.actualDelta,).toBe(-10,);
  });

  // ── NSFW capability gate (TASK-033) ──────────────────────────

  test("applyAction without gate context applies (pre-gate behavior preserved)", async () => {
    const db = await seedTestDb();
    const service = new IntimacyService(db,);

    const result = await service.applyAction({
      database: db,
      actorId: "actor-1",
      targetActorId: "actor-2",
      action: { id: "a1", name: "Gift", type: "gift", delta: 10, minIntimacy: 0, requiresConsent: false, },
    },);

    expect(result.applied,).toBe(true,);
  });

  // ── Mood follow-through (TASK-041) ───────────────────────────

  test("cross-tier transition logs one source-tagged mood event on the target", async () => {
    const db = await seedTestDb();
    const service = new IntimacyService(db,);

    // Mood row must exist for logEvent's delta application.
    await insertCharacterMood(db, "actor-2", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",);

    const result = await service.applyAction({
      database: db,
      actorId: "actor-1",
      targetActorId: "actor-2",
      action: { id: "a1", name: "Help", type: "service", delta: 15, minIntimacy: 0, requiresConsent: false, },
    },);

    // 0 → 15 crosses the acquaintances threshold (10) exactly once.
    expect(result.thresholdsReached.length,).toBe(1,);
    const events = await db.selectFrom("mood_events",)
      .where("actor_id", "=", "actor-2",)
      .selectAll()
      .execute();
    expect(events.length,).toBe(1,);
    expect(events[0]!.event_type,).toBe("intimacy.level_changed",);
    expect(events[0]!.source,).toBe("intimacy",);
  });

  test("same-tier update logs no mood event", async () => {
    const db = await seedTestDb();
    const service = new IntimacyService(db,);

    await insertCharacterMood(db, "actor-2", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",);

    // delta 5 stays below the acquaintances threshold (10) — no crossing.
    const result = await service.applyAction({
      database: db,
      actorId: "actor-1",
      targetActorId: "actor-2",
      action: { id: "a1", name: "Wave", type: "verbal", delta: 5, minIntimacy: 0, requiresConsent: false, },
    },);

    expect(result.thresholdsReached,).toEqual([],);
    const events = await db.selectFrom("mood_events",)
      .where("actor_id", "=", "actor-2",)
      .selectAll()
      .execute();
    expect(events,).toEqual([],);
  });
});

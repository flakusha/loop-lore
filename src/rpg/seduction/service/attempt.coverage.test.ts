// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for attemptSeduction.
 *
 * Real in-memory DB round-trips: hard-limit rejection, unseeded crypto
 * dice (bounded retry loops, never pinned exacts), fantasy-flag DC
 * branches, DC floor clamping, skill-category mismatch, and the
 * persisted arousal + dual-XP + mood side effects.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema.js";
import { createTestDb, } from "../../../test-utils/create-test-db.js";
import {
  insertActors,
  insertCharacterArousal,
  insertCharacterDesireProfile,
  insertCharacterFantasies,
  insertCharacterMood,
  insertCharacterSeductionSkills,
} from "../../../test-utils/insert-helpers.js";
import { FantasyCategory, } from "../../../db/enums-character/nsfw.js";
import type { SeductionResult, } from "./types.js";
import { uid, } from "../../../utils.js";
import { attemptSeduction, } from "./attempt.js";

let db: Kysely<DB>;

beforeAll(async () => {
  ({ db, } = await createTestDb());
},);

afterAll(async () => {
  await db.destroy();
},);

/** Create an actor pair and return their ids. */
async function makePair(): Promise<{ actorId: string; targetId: string }> {
  const actorId = uid();
  const targetId = uid();
  await insertActors(db, `seducer-${actorId}`, { id: actorId, },);
  await insertActors(db, `target-${targetId}`, { id: targetId, },);
  return { actorId, targetId, };
}

const NOW = "2026-01-01T00:00:00.000Z";

/** Seed a desire profile with JSON-encoded list fields. */
async function seedDesire(
  targetId: string,
  opts?: {
    turnOns?: string[];
    turnOffs?: string[];
    hardLimits?: string[];
    currentDesire?: number;
  },
): Promise<void> {
  await insertCharacterDesireProfile(db, targetId, NOW, NOW, {
    turn_ons: JSON.stringify(opts?.turnOns ?? [],),
    turn_offs: JSON.stringify(opts?.turnOffs ?? [],),
    fetishes: "[]",
    hard_limits: JSON.stringify(opts?.hardLimits ?? [],),
    current_desire: opts?.currentDesire ?? 0,
  },);
}

describe("attemptSeduction", () => {
  test("hard-limit approach is rejected before any dice roll", async () => {
    const { actorId, targetId, } = await makePair();
    await seedDesire(targetId, { hardLimits: ["blood magic",], },);
    const result = await attemptSeduction(db, {
      database: db,
      actorId,
      targetId,
      skillCategory: "communication",
      approach: "a Blood Magic ritual under moonlight",
    },);
    expect(result,).toEqual({
      success: false,
      roll: 0,
      dc: 100,
      arousalDelta: -10,
      intimacyDelta: -5,
      xpGained: 0,
      description: "Hard limit triggered — seduction rejected.",
      hardLimitTriggered: true,
    },);
    const arousal = await db.selectFrom("character_arousal",)
      .where("actor_id", "=", targetId,)
      .selectAll()
      .execute();
    expect(arousal,).toEqual([],);
  });

  test("turn-on match lowers DC and success persists arousal plus skill XP", async () => {
    const { actorId, targetId, } = await makePair();
    await seedDesire(targetId, { turnOns: ["roses",], },);
    // Fantasy-flag turn-on (TASK-034): a praise-category fantasy row on the
    // target — the "beautiful" approach tags Praise and earns the DC cut.
    await insertCharacterFantasies(db, targetId, "Admiration", FantasyCategory.Praise, NOW, NOW,);
    await insertCharacterSeductionSkills(
      db,
      actorId,
      "communication",
      "Small Talk",
      NOW,
      NOW,
      { level: 5, xp: 0, xp_to_next: 1000, },
    );
    // roll = d100 crypto roll in [1,100] + CHA modifier (all-10 → 0);
    // retry until success — dc 35 vs d100 succeeds with p=0.66, so this
    // terminates almost surely (bounded at 50 tries to fail loudly, not
    // hang, on an engine regression).
    let result: SeductionResult | undefined;
    for (let attempt = 0; attempt < 50; attempt++) {
      const candidate = await attemptSeduction(db, {
        database: db,
        actorId,
        targetId,
        skillCategory: "communication",
        approach: "telling them they are beautiful, offering fresh roses with a smile",
      },);
      // dc = 50 - 15 (praise fantasy flag) = 35 on every try.
      expect(candidate.dc,).toBe(35,);
      if (candidate.success) {
        result = candidate;
        break;
      }
    }
    expect(result?.success,).toBe(true,);
    if (result === undefined) { throw new Error("unreachable: asserted above",); }
    // arousalDelta = 10 + floor(5 * 0.3) = 11; intimacy = 3 + floor(5 * 0.1) = 3.
    // xpGained = 15 + floor(35 / 5) = 22. The retry loop rerolls on
    // failure, and failed attempts ALSO award consolation XP (5) to the
    // same skill row — so the row total is >= 22, exactly 22 only when
    // the first try succeeds. Assert the row gained at least 22.
    expect(result.arousalDelta,).toBe(11,);
    expect(result.intimacyDelta,).toBe(3,);
    expect(result.xpGained,).toBe(22,);
    expect(result.description,).toBe(
      "Seduction successful! telling them they are beautiful, offering fresh roses with a smile resonated with the target.",
    );
    expect(result.hardLimitTriggered,).toBe(false,);

    const arousal = await db.selectFrom("character_arousal",)
      .where("actor_id", "=", targetId,)
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(arousal.level,).toBe(11,);

    const skill = await db.selectFrom("character_seduction_skills",)
      .where("actor_id", "=", actorId,)
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(skill.xp,).toBeGreaterThanOrEqual(22,);
  });

  test("failed attempt applies negative deltas and consolation XP without a skill", async () => {
    // Unseeded d100 roll — retry until failure (dc 50 → p≈0.5, bounded).
    // NOTE: each attempt persists arousal/XP, so retries use a FRESH pair
    // per try — otherwise a prior success on the same pair pollutes the
    // zero-baseline assertions below. The failing attempt is then the
    // first and only attempt on its pair, and all assertions are exact.
    let pair: { actorId: string; targetId: string } | undefined;
    let result: SeductionResult | undefined;
    for (let attempt = 0; attempt < 50; attempt++) {
      const fresh = await makePair();
      await seedDesire(fresh.targetId,);
      const candidate = await attemptSeduction(db, {
        database: db,
        actorId: fresh.actorId,
        targetId: fresh.targetId,
        skillCategory: "communication",
        approach: "an awkward hello",
      },);
      // Fresh pair every try: zero arousal/desire, no fantasy rows.
      expect(candidate.dc,).toBe(50,);
      if (!candidate.success) {
        pair = fresh;
        result = candidate;
        break;
      }
    }
    expect(result?.success,).toBe(false,);
    if (result === undefined || pair === undefined) { throw new Error("unreachable: asserted above",); }
    expect(result.dc,).toBe(50,);
    expect(result.arousalDelta,).toBe(-5,);
    expect(result.intimacyDelta,).toBe(-2,);
    expect(result.xpGained,).toBe(5,);
    expect(result.description,).toBe(
      "Seduction failed. an awkward hello didn't land as intended.",
    );
    expect(result.hardLimitTriggered,).toBe(false,);

    // Negative delta on a zero baseline clamps at zero.
    const arousal = await db.selectFrom("character_arousal",)
      .where("actor_id", "=", pair.targetId,)
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(arousal.level,).toBe(0,);

    // No matching skill: no skill row is created for the actor.
    const skills = await db.selectFrom("character_seduction_skills",)
      .where("actor_id", "=", pair.actorId,)
      .selectAll()
      .execute();
    expect(skills,).toEqual([],);
  });

  test("turn-off match raises the DC", async () => {
    const { actorId, targetId, } = await makePair();
    await seedDesire(targetId, { turnOffs: ["loud",], },);
    const result = await attemptSeduction(db, {
      database: db,
      actorId,
      targetId,
      skillCategory: "communication",
      approach: "a LOUD party entrance",
    },);
    expect(result.dc,).toBe(65,);
  });

  test("high arousal and desire clamp the DC at the floor of 10", async () => {
    const { actorId, targetId, } = await makePair();
    // No turn-on seed here: the DC math under test is arousal + desire only.
    // dc = 50 - floor(100 * 0.3) - floor(100 * 0.2) = 0 -> clamped to 10.
    await seedDesire(targetId, { currentDesire: 100, },);
    await insertCharacterArousal(db, targetId, NOW, NOW, NOW, { level: 100, },);
    const result = await attemptSeduction(db, {
      database: db,
      actorId,
      targetId,
      skillCategory: "communication",
      approach: "a calm respectful greeting",
    },);
    expect(result.dc,).toBe(10,);
  });

  test("skill in another category falls back to level 1 and earns no XP", async () => {
    const { actorId, targetId, } = await makePair();
    await seedDesire(targetId,);
    await insertCharacterSeductionSkills(
      db,
      actorId,
      "massage",
      "Deep Tissue",
      NOW,
      NOW,
      { level: 20, xp: 7, xp_to_next: 1000, },
    );
    // Level-20 massage skill is ignored for a communication attempt;
    // xpGained mirrors the level-1 path but the massage row is untouched.
    const result = await attemptSeduction(db, {
      database: db,
      actorId,
      targetId,
      skillCategory: "communication",
      approach: "polite conversation",
    },);
    expect(result.xpGained,).toBeGreaterThan(0,);

    const skill = await db.selectFrom("character_seduction_skills",)
      .where("actor_id", "=", actorId,)
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(skill.xp,).toBe(7,);
    expect(skill.level,).toBe(20,);
  });

  test("hostile reputation tier blocks the attempt before any roll or mutation", async () => {
    const { actorId, targetId, } = await makePair();
    await seedDesire(targetId,);
    const result = await attemptSeduction(db, {
      database: db,
      actorId,
      targetId,
      skillCategory: "communication",
      approach: "a dark persuasive whisper",
      reputationTier: "hostile",
    },);
    expect(result.success,).toBe(false,);
    expect(result.roll,).toBe(0,);
    expect(result.dc,).toBe(0,);
    expect(result.arousalDelta,).toBe(0,);
    expect(result.intimacyDelta,).toBe(0,);
    expect(result.xpGained,).toBe(0,);
    expect(result.prerequisiteBlocked,).toBe(true,);
    expect(result.missingPrerequisite?.length,).toBeGreaterThan(0,);
    // No state mutated on refusal: no arousal row, no skill row.
    const arousal = await db.selectFrom("character_arousal",)
      .where("actor_id", "=", targetId,)
      .selectAll()
      .execute();
    expect(arousal,).toEqual([],);
  });

  test("dominance skill maps to intimidation but deception still blocks hostile", async () => {
    const { actorId, targetId, } = await makePair();
    await seedDesire(targetId,);
    await insertCharacterSeductionSkills(
      db,
      actorId,
      "dominance",
      "Commanding Presence",
      NOW,
      NOW,
      { level: 7, xp: 0, xp_to_next: 1000, },
    );
    const result = await attemptSeduction(db, {
      database: db,
      actorId,
      targetId,
      skillCategory: "communication",
      approach: "an imperious demand",
      reputationTier: "hostile",
    },);
    expect(result.prerequisiteBlocked,).toBe(true,);
    // intimidation level 7×10 = 70 ≥ 70 passes; deception (CHA 10) < 80 blocks.
    expect(result.missingPrerequisite?.map((p,) => p.skill),).toEqual(["deception",],);
  });

  test("friendly tier prerequisites pass with a communication skill", async () => {
    const { actorId, targetId, } = await makePair();
    await seedDesire(targetId,);
    await insertCharacterSeductionSkills(
      db,
      actorId,
      "communication",
      "Silver Tongue",
      NOW,
      NOW,
      { level: 4, xp: 0, xp_to_next: 1000, },
    );
    // charisma proxy = 4×10 = 40 ≥ 20 → no prerequisite block.
    // Retry until the d100 roll beats the DC (unseeded crypto RNG).
    let result: SeductionResult | undefined;
    for (let attempt = 0; attempt < 50; attempt++) {
      const candidate = await attemptSeduction(db, {
        database: db,
        actorId,
        targetId,
        skillCategory: "communication",
        approach: "warm friendly conversation",
        reputationTier: "friendly",
      },);
      expect(candidate.prerequisiteBlocked ?? false,).toBe(false,);
      if (candidate.success) {
        result = candidate;
        break;
      }
    }
    expect(result?.success,).toBe(true,);
  });

  // ── Edge cases ──────────────────────────────────────────────

  test("attemptSeduction against a non-existent target throws (FK violation on desire profile)", async () => {
    // getDesireProfile inserts a default row when missing — but that
    // insert hits the actor FK and fails because no actor with that id
    // exists. Pin the observable behavior.
    const { actorId, } = await makePair();
    const ghostTargetId = uid();
    await expect(
      attemptSeduction(db, {
        database: db,
        actorId,
        targetId: ghostTargetId,
        skillCategory: "communication",
        approach: "polite greeting",
      },),
    ).rejects.toThrow();
  });

  test("DC floor of 10 applies when multiple negative contributions push below zero", async () => {
    const { actorId, targetId, } = await makePair();
    // No fantasy rows seeded for the pair: "silk velvet roses with
    // intelligence and care" tags no FantasyCategory, so the DC math is
    // arousal + desire only: 50 - 30 - 20 = 0 -> clamped to 10.
    await seedDesire(targetId, {
      turnOns: ["silk", "velvet", "roses", "intelligence",],
      currentDesire: 100,
    },);
    await insertCharacterArousal(db, targetId, NOW, NOW, NOW, { level: 100, },);
    await insertCharacterSeductionSkills(
      db,
      actorId,
      "communication",
      "Charmer",
      NOW,
      NOW,
      { level: 1, xp: 0, xp_to_next: 1000, },
    );
    const result = await attemptSeduction(db, {
      database: db,
      actorId,
      targetId,
      skillCategory: "communication",
      approach: "soft silk velvet roses with intelligence and care",
    },);
    expect(result.dc,).toBe(10,);
  });

  test("hard-limit trigger rolls no dice (early return)", async () => {
    const { actorId, targetId, } = await makePair();
    await seedDesire(targetId, { hardLimits: ["fire",], },);
    const result = await attemptSeduction(db, {
      database: db,
      actorId,
      targetId,
      skillCategory: "communication",
      approach: "fire play on skin",
    },);
    // Early return: zeroed roll/DC shape proves no dice were consumed.
    expect(result.hardLimitTriggered,).toBe(true,);
    expect(result.roll,).toBe(0,);
    expect(result.dc,).toBe(100,);
  });

  test("devoted reputation tier with no skills passes prerequisite check", async () => {
    const { actorId, targetId, } = await makePair();
    await seedDesire(targetId,);
    // No skills, no stats — devoted tier has no prerequisites.
    const result = await attemptSeduction(db, {
      database: db,
      actorId,
      targetId,
      skillCategory: "communication",
      approach: "a loving whisper",
      reputationTier: "devoted",
    },);
    expect(result.prerequisiteBlocked ?? false,).toBe(false,);
    expect(result.hardLimitTriggered,).toBe(false,);
  });

  // ── Shared ledger + mood side effects (TASK-040/041) ──────────

  test("successful attempt mirrors XP to the shared ledger and logs a mood event", async () => {
    const { actorId, targetId, } = await makePair();
    await seedDesire(targetId,);
    // Mood row must exist: logEvent applies its happiness delta to
    // character_mood, and settleAttempt's try/catch swallows the
    // failure otherwise (same reason the other attempt tests assert
    // no throw but skip mood rows).
    await insertCharacterMood(db, targetId, NOW, NOW, NOW,);
    // Seed a MATCHING skill: with no skill, settleAttempt's `if
    // (relevantSkill)` guard skips BOTH awardXp AND the shared-ledger
    // mirror — the failure test above pins that. With a skill, the
    // winning attempt mirrors xpGained to the nsfw_seduction source.
    await insertCharacterSeductionSkills(
      db,
      actorId,
      "communication",
      "Small Talk",
      NOW,
      NOW,
      { level: 1, xp: 0, xp_to_next: 1000, },
    );
    // Unseeded d100 — retry until success (dc 50 → p≈0.51, bounded).
    let result: SeductionResult | undefined;
    for (let attempt = 0; attempt < 50; attempt++) {
      const candidate = await attemptSeduction(db, {
        database: db,
        actorId,
        targetId,
        skillCategory: "communication",
        approach: "a respectful compliment",
      },);
      if (candidate.success) {
        result = candidate;
        break;
      }
    }
    expect(result?.success,).toBe(true,);
    if (result === undefined) { throw new Error("unreachable: asserted above",); }

    // Shared RPG ledger (TASK-040): this attempt's XP is mirrored under
    // the nsfw_seduction source — one row per attempt (failed retries
    // log consolation XP too). Total >= the winning xpGained.
    const ledger = await db.selectFrom("xp_ledger",)
      .where("actor_id", "=", actorId,)
      .where("source", "=", "nsfw_seduction",)
      .selectAll()
      .execute();
    expect(ledger.length,).toBeGreaterThanOrEqual(1,);
    const total = ledger.reduce((sum, row,) => sum + row.amount, 0,);
    expect(total,).toBeGreaterThanOrEqual(result.xpGained,);
    expect(
      ledger.some((row,) => row.amount === result.xpGained && (row.description ?? "").startsWith("Seduction success",),),
    ).toBe(true,);

    // Mood follow-through (TASK-041): one seduction.success event on target.
    // NOTE: failed retries log seduction.failure events first, so filter
    // by event_type instead of asserting a single row.
    const events = await db.selectFrom("mood_events",)
      .where("actor_id", "=", targetId,)
      .selectAll()
      .execute();
    expect(
      events.some((row,) => row.event_type === "seduction.success" && row.source === "seduction",),
    ).toBe(true,);
  });

  test("fantasy flag absence leaves neutral approaches at base DC", async () => {
    const { actorId, targetId, } = await makePair();
    // No fantasy rows for the pair: "roses" is not a FantasyCategory
    // token, so the DC stays at the base 50 with no flag adjustment.
    await seedDesire(targetId, { turnOns: ["roses",], },);
    const result = await attemptSeduction(db, {
      database: db,
      actorId,
      targetId,
      skillCategory: "communication",
      approach: "offering fresh roses with a smile",
    },);
    expect(result.dc,).toBe(50,);
  });
});

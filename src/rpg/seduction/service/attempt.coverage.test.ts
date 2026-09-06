// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for attemptSeduction.
 *
 * Real in-memory DB round-trips: hard-limit rejection, deterministic
 * success/failure dice (stubbed Math.random), turn-on/turn-off DC
 * branches, DC floor clamping, skill-category mismatch, and the
 * persisted arousal + skill-XP side effects.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema.js";
import { createTestDb, } from "../../../test-utils/create-test-db.js";
import {
  insertActors,
  insertCharacterArousal,
  insertCharacterDesireProfile,
  insertCharacterSeductionSkills,
} from "../../../test-utils/insert-helpers.js";
import { uid, } from "../../../utils.js";
import { attemptSeduction, } from "./attempt.js";

let db: Kysely<DB>;
let originalRandom: () => number;

beforeAll(async () => {
  ({ db, } = await createTestDb());
  originalRandom = Math.random;
},);

afterAll(async () => {
  Math.random = originalRandom;
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
    Math.random = () => 0.999999;
    try {
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
    } finally {
      Math.random = originalRandom;
    }
    const arousal = await db.selectFrom("character_arousal",)
      .where("actor_id", "=", targetId,)
      .selectAll()
      .execute();
    expect(arousal,).toEqual([],);
  });

  test("turn-on match lowers DC and success persists arousal plus skill XP", async () => {
    const { actorId, targetId, } = await makePair();
    await seedDesire(targetId, { turnOns: ["roses",], },);
    await insertCharacterSeductionSkills(
      db,
      actorId,
      "communication",
      "Small Talk",
      NOW,
      NOW,
      { level: 5, xp: 0, xp_to_next: 1000, },
    );
    // roll = floor(0.999999 * 50) + floor(5 / 2) = 49 + 2 = 51; dc = 50 - 15 = 35.
    Math.random = () => 0.999999;
    try {
      const result = await attemptSeduction(db, {
        database: db,
        actorId,
        targetId,
        skillCategory: "communication",
        approach: "offering fresh roses with a smile",
      },);
      expect(result.success,).toBe(true,);
      expect(result.roll,).toBe(51,);
      expect(result.dc,).toBe(35,);
      // arousalDelta = 10 + floor(5 * 0.3) = 11; intimacy = 3 + floor(5 * 0.1) = 3.
      expect(result.arousalDelta,).toBe(11,);
      expect(result.intimacyDelta,).toBe(3,);
      // xpGained = 15 + floor(35 / 5) = 22.
      expect(result.xpGained,).toBe(22,);
      expect(result.description,).toBe(
        "Seduction successful! offering fresh roses with a smile resonated with the target.",
      );
      expect(result.hardLimitTriggered,).toBe(false,);
    } finally {
      Math.random = originalRandom;
    }

    const arousal = await db.selectFrom("character_arousal",)
      .where("actor_id", "=", targetId,)
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(arousal.level,).toBe(11,);

    const skill = await db.selectFrom("character_seduction_skills",)
      .where("actor_id", "=", actorId,)
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(skill.xp,).toBe(22,);
  });

  test("failed attempt applies negative deltas and consolation XP without a skill", async () => {
    const { actorId, targetId, } = await makePair();
    await seedDesire(targetId,);
    // roll = 0 + floor(1 / 2) = 0 against dc 50.
    Math.random = () => 0;
    try {
      const result = await attemptSeduction(db, {
        database: db,
        actorId,
        targetId,
        skillCategory: "communication",
        approach: "an awkward hello",
      },);
      expect(result.success,).toBe(false,);
      expect(result.roll,).toBe(0,);
      expect(result.dc,).toBe(50,);
      expect(result.arousalDelta,).toBe(-5,);
      expect(result.intimacyDelta,).toBe(-2,);
      expect(result.xpGained,).toBe(5,);
      expect(result.description,).toBe(
        "Seduction failed. an awkward hello didn't land as intended.",
      );
      expect(result.hardLimitTriggered,).toBe(false,);
    } finally {
      Math.random = originalRandom;
    }

    // Negative delta on a zero baseline clamps at zero.
    const arousal = await db.selectFrom("character_arousal",)
      .where("actor_id", "=", targetId,)
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(arousal.level,).toBe(0,);

    // No matching skill: no skill row is created for the actor.
    const skills = await db.selectFrom("character_seduction_skills",)
      .where("actor_id", "=", actorId,)
      .selectAll()
      .execute();
    expect(skills,).toEqual([],);
  });

  test("turn-off match raises the DC", async () => {
    const { actorId, targetId, } = await makePair();
    await seedDesire(targetId, { turnOffs: ["loud",], },);
    Math.random = () => 0;
    try {
      const result = await attemptSeduction(db, {
        database: db,
        actorId,
        targetId,
        skillCategory: "communication",
        approach: "a LOUD party entrance",
      },);
      expect(result.success,).toBe(false,);
      expect(result.dc,).toBe(65,);
    } finally {
      Math.random = originalRandom;
    }
  });

  test("high arousal and desire clamp the DC at the floor of 10", async () => {
    const { actorId, targetId, } = await makePair();
    await seedDesire(targetId, { turnOns: ["velvet",], currentDesire: 100, },);
    await insertCharacterArousal(db, targetId, NOW, NOW, NOW, { level: 100, },);
    // dc = 50 - floor(100 * 0.3) - floor(100 * 0.2) - 15 = -15 -> clamped to 10.
    Math.random = () => 0;
    try {
      const result = await attemptSeduction(db, {
        database: db,
        actorId,
        targetId,
        skillCategory: "communication",
        approach: "a velvet cloak offered gently",
      },);
      expect(result.dc,).toBe(10,);
      expect(result.success,).toBe(false,);
    } finally {
      Math.random = originalRandom;
    }
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
    Math.random = () => 0;
    try {
      const result = await attemptSeduction(db, {
        database: db,
        actorId,
        targetId,
        skillCategory: "communication",
        approach: "polite conversation",
      },);
      // Level-20 massage skill is ignored: roll = 0 + floor(1 / 2) = 0.
      expect(result.roll,).toBe(0,);
      expect(result.success,).toBe(false,);
      expect(result.xpGained,).toBe(5,);
    } finally {
      Math.random = originalRandom;
    }

    const skill = await db.selectFrom("character_seduction_skills",)
      .where("actor_id", "=", actorId,)
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(skill.xp,).toBe(7,);
    expect(skill.level,).toBe(20,);
  });
});

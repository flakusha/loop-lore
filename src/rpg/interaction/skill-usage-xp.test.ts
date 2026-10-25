// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Skill-usage XP leg tests (FEAT-skill-usage).
 *
 * A successful interaction check pays both the exercised `character_skills`
 * row and the character sheet (`skill_use` ledger source); failures pay
 * nothing; opted-out worlds pay nothing; the gate stays fail-open without a
 * world; the interaction-id reference keeps retries idempotent.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema.js";
import { createLogger, } from "../../logger/index.js";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db.js";
import {
  insertActors,
  insertCharacterSkills,
  insertCharacterStats,
  insertChats,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers.js";
import { encodeReferencePair, XpSource, } from "../xp/sources.js";
import { resolveInteraction, } from "./service.js";
import { awardSkillUsageXp, difficultyForDc, } from "./skill-usage-xp.js";

let db: Kysely<DB>;
let fixture: TestDb;
let ownerId: string;
let worldId: string;
let chatId: string;

// The d20 is crypto-random, so a bare roll can land a natural 1 — which the
// interaction service resolves as a CRITICAL FAILURE regardless of the DC.
// Rig the die so the success path under test is deterministic.
const withForcedDie = async <T,>(value: number, run: () => Promise<T>,): Promise<T> => {
  const original = crypto.getRandomValues;
  Object.defineProperty(crypto, "getRandomValues", {
    configurable: true,
    value: (array: Uint32Array,) => {
      array[0] = value - 1;
      return array;
    },
  },);

  try {
    return await run();
  } finally {
    Object.defineProperty(crypto, "getRandomValues", { configurable: true, value: original, },);
  }
};

beforeEach(async () => {
  createLogger({ level: "error", },);
  fixture = await createTestDb();
  db = fixture.db;
  ownerId = await insertUsers(db, `skill-xp-owner-${crypto.randomUUID()}`, "Skill XP Owner",);
  worldId = await insertWorlds(db, ownerId, "Skill XP World", {
    rpg_enabled: 1,
    rpg_dice: 1,
    rpg_checks: 1,
    rpg_combat: 1,
    rpg_xp: 1,
    rpg_loot: 1,
    rpg_quests: 1,
  },);

  chatId = await insertChats(db, `Skill XP Chat ${crypto.randomUUID()}`, ownerId,);
},);

afterEach(async () => {
  await destroyTestDb(fixture,);
},);

async function seedActor(name: string,): Promise<string> {
  return insertActors(db, name, { actor_type: "character", },);
}

async function seedSkill(actorId: string, name: string,): Promise<string> {
  return insertCharacterSkills(db, actorId, name, "social", {
    world_id: worldId,
  },);
}

async function ledgerFor(actorId: string,) {
  return db.selectFrom("xp_ledger",).selectAll().where("actor_id", "=", actorId,).execute();
}

async function interactionIdFor(): Promise<string> {
  return crypto.randomUUID();
}

describe("difficultyForDc", () => {
  test("maps DC tiers onto the skill-challenge ladder", () => {
    expect(difficultyForDc(5,),).toBe("easy",);
    expect(difficultyForDc(10,),).toBe("easy",);
    expect(difficultyForDc(12,),).toBe("medium",);
    expect(difficultyForDc(15,),).toBe("medium",);
    expect(difficultyForDc(20,),).toBe("hard",);
  });
});

describe("awardSkillUsageXp", () => {
  test("success pays the skill row and the character sheet with source skill_use", async () => {
    const actorId = await seedActor("Skill User",);
    const skillId = await seedSkill(actorId, "persuasion",);
    const interactionId = await interactionIdFor();

    await awardSkillUsageXp(db, {
      interactionId,
      actorId,
      worldId,
      chatId: "chat-1",
      skill: "persuasion",
      difficulty: 12,
      success: true,
    },);

    // Medium DC at level 1: 100 * 1 * 0.5 = 50.
    const skill = await db.selectFrom("character_skills",).selectAll().where("id", "=", skillId,)
      .executeTakeFirstOrThrow();

    expect(skill.xp,).toBe(50,);

    const rows = await ledgerFor(actorId,);
    expect(rows,).toHaveLength(2,);
    const bySource = new Map(rows.map((r,) => [r.source, r,] as const),);
    expect(bySource.get(XpSource.SkillUsage,)?.amount,).toBe(50,);
    expect(bySource.get(XpSource.SkillUsage,)?.reference_id,).toBe(encodeReferencePair(skillId, 50,),);
    expect(bySource.get("skill_use",)?.reference_id,).toBe(interactionId,);
    expect(bySource.get("skill_use",)?.amount,).toBe(50,);
    const stats = await db.selectFrom("character_stats",).selectAll().where("actor_id", "=", actorId,)
      .executeTakeFirstOrThrow();

    expect(stats.xp,).toBe(50,);
  });

  test("failure pays nothing on either store", async () => {
    const actorId = await seedActor("Failed User",);
    const skillId = await seedSkill(actorId, "persuasion",);

    await awardSkillUsageXp(db, {
      interactionId: await interactionIdFor(),
      actorId,
      worldId,
      chatId: "chat-1",
      skill: "persuasion",
      difficulty: 12,
      success: false,
    },);

    const skill = await db.selectFrom("character_skills",).selectAll().where("id", "=", skillId,)
      .executeTakeFirstOrThrow();

    expect(skill.xp,).toBe(0,);
    expect(await ledgerFor(actorId,),).toHaveLength(0,);
  });

  test("opted-out world pays nothing on either store", async () => {
    const offWorld = await insertWorlds(db, ownerId, "No XP World", { rpg_enabled: 0, },);
    const actorId = await seedActor("Gated User",);
    const skillId = await seedSkill(actorId, "persuasion",);

    await awardSkillUsageXp(db, {
      interactionId: await interactionIdFor(),
      actorId,
      worldId: offWorld,
      chatId: "chat-1",
      skill: "persuasion",
      difficulty: 12,
      success: true,
    },);

    const skill = await db.selectFrom("character_skills",).selectAll().where("id", "=", skillId,)
      .executeTakeFirstOrThrow();

    expect(skill.xp,).toBe(0,);
    expect(await ledgerFor(actorId,),).toHaveLength(0,);
    expect(
      await db.selectFrom("character_stats",).selectAll().where("actor_id", "=", actorId,).execute(),
    ).toHaveLength(0,);
  });

  test("world-less resolution stays fail-open", async () => {
    const actorId = await seedActor("Worldless User",);

    await awardSkillUsageXp(db, {
      interactionId: await interactionIdFor(),
      actorId,
      worldId: null,
      chatId: "chat-1",
      skill: "persuasion",
      difficulty: 12,
      success: true,
    },);

    const rows = await ledgerFor(actorId,);
    expect(rows,).toHaveLength(1,);
    expect(rows[0]!.source,).toBe("skill_use",);
  });

  test("retry with the same interaction id stays idempotent", async () => {
    const actorId = await seedActor("Retried User",);
    await seedSkill(actorId, "persuasion",);
    const interactionId = await interactionIdFor();
    const input = {
      interactionId,
      actorId,
      worldId,
      chatId: "chat-1",
      skill: "persuasion",
      difficulty: 12,
      success: true,
    };

    await awardSkillUsageXp(db, input,);
    await awardSkillUsageXp(db, input,);

    // The sheet half dedupes on (actor, skill_use, interaction-id); the
    // skill-row half keys on [skillId, amount], so a retry re-applies the row
    // half while the sheet half stays single-applied.
    const rows = await ledgerFor(actorId,);
    const sheetRows = rows.filter((r,) => r.source === "skill_use");
    expect(sheetRows,).toHaveLength(1,);
    expect(sheetRows[0]!.reference_id,).toBe(interactionId,);
    const stats = await db.selectFrom("character_stats",).selectAll().where("actor_id", "=", actorId,)
      .executeTakeFirstOrThrow();

    expect(stats.xp,).toBe(50,);
  });

  test("unknown skill name still pays the character sheet", async () => {
    const actorId = await seedActor("Odd Skill User",);

    await awardSkillUsageXp(db, {
      interactionId: await interactionIdFor(),
      actorId,
      worldId,
      chatId: "chat-1",
      skill: "not-a-real-skill",
      difficulty: 8,
      success: true,
    },);

    // Easy DC at level 1: 100 * 1 * 0.25 = 25.
    const rows = await ledgerFor(actorId,);
    expect(rows,).toHaveLength(1,);
    expect(rows[0]!.amount,).toBe(25,);
  });

  test("uses the actor sheet level for the payout", async () => {
    const actorId = await seedActor("Leveled User",);
    await insertCharacterStats(db, actorId, 10, 10, 10, { level: 3, xp: 900, },);

    await awardSkillUsageXp(db, {
      interactionId: await interactionIdFor(),
      actorId,
      worldId,
      chatId: "chat-1",
      skill: "persuasion",
      difficulty: 20,
      success: true,
    },);

    // Hard DC at level 3: 100 * 3 * 1 = 300.
    const rows = await ledgerFor(actorId,);
    expect(rows,).toHaveLength(1,);
    expect(rows[0]!.amount,).toBe(300,);
  });

  test("resolveInteraction pays the exercised skill on success", async () => {
    const actorId = await seedActor("Resolved User",);
    const skillId = await seedSkill(actorId, "persuasion",);
    // DC 1: a rigged non-natural-1 roll always succeeds, so the payout path
    // under test is the deterministic one.
    const resolution = await withForcedDie(15, async () =>
      await resolveInteraction(db, {
        command: "persuade",
        category: "social",
        actorId,
        chatId,
        worldId,
        skill: "persuasion",
        difficulty: 1,
      },),);

    expect(resolution.id,).not.toBeNull();

    const skill = await db.selectFrom("character_skills",).selectAll().where("id", "=", skillId,)
      .executeTakeFirstOrThrow();

    expect(skill.xp,).toBeGreaterThan(0,);
    const rows = await ledgerFor(actorId,);
    const sheetRows = rows.filter((r,) => r.source === "skill_use");
    expect(sheetRows,).toHaveLength(1,);
    expect(sheetRows[0]!.reference_id,).toBe(resolution.id,);
  });
});

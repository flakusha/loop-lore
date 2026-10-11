// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/story/quest-engine/xp.edge-cases.test.ts — adversarial edges of the
 * quest / discovery XP legs that `xp.test.ts` does not cover.
 *
 * Assertions marked BUG pin current behavior on purpose so a future fix
 * flips exactly one assertion; the findings are reported in the epic notes.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { applyDiscoveryXpLeg, } from "../../rpg/world-discovery/xp-leg";
import { QUEST_XP_MINIMUM, } from "../../rpg/xp/sources.js";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertCharacterStats,
  insertQuests,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { awardQuestCompletionXp, } from "./xp";

let db: Kysely<DB>;
let fixture: TestDb;
let ownerId: string;

beforeEach(async () => {
  fixture = await createTestDb();
  db = fixture.db;
  ownerId = await insertUsers(db, "quest-edges", "Quest Edges",);
},);

afterEach(async () => {
  await destroyTestDb(fixture,);
},);

// Shared projections used across ≥3 tests.
async function seedActor(name: string,): Promise<string> {
  return insertActors(db, name, { user_id: ownerId, actor_type: "character", },);
}

async function ledgerFor(actorId: string,) {
  return db.selectFrom("xp_ledger",).selectAll().where("actor_id", "=", actorId,).execute();
}

async function statsRowCount(actorId: string,) {
  const rows = await db.selectFrom("character_stats",).selectAll().where("actor_id", "=", actorId,).execute();
  return rows.length;
}

// ── Quest completion XP ──────────────────────────────────

describe("awardQuestCompletionXp edges", () => {
  test("double completion in the same tick applies exactly once", async () => {
    // Concurrent completion paths (progress tick + /quest command racing
    // in one turn) resolve through the award transaction + the
    // (actor, source, reference_id) UNIQUE index: exactly one grant lands,
    // the loser replays (deduped), and the sheet is written once.
    const creator = await seedActor("Raced Creator",);
    const worldId = await insertWorlds(db, ownerId, "Raced World",);
    const questId = await insertQuests(db, worldId, creator, "Race Quest", "social", 1,);
    const quest = await db.selectFrom("quests",).selectAll().where("id", "=", questId,).executeTakeFirstOrThrow();

    await Promise.all([
      awardQuestCompletionXp(db, quest,),
      awardQuestCompletionXp(db, quest,),
    ],);

    const rows = await ledgerFor(creator,);
    expect(rows,).toHaveLength(1,);
    expect(rows[0]!.amount,).toBe(300,);
    expect(await statsRowCount(creator,),).toBe(1,);
    const stats = await db.selectFrom("character_stats",).selectAll()
      .where("actor_id", "=", creator,).executeTakeFirstOrThrow();

    expect(stats.xp,).toBe(300,);
  });

  test("quest XP at MAX_LEVEL floors to the minimum award, not 0", async () => {
    // xpForQuest derives from xpForLevel(level+1) − xpForLevel(level); both
    // clamp at MAX_LEVEL 20, which would pay 0. The payout floors to
    // QUEST_XP_MINIMUM (100) so completing content never pays nothing and
    // never burns a dedupe key on a zero row.
    const creator = await seedActor("Capped Creator",);
    await insertCharacterStats(db, creator, 10, 10, 10, { level: 20, xp: 355_000, },);
    const worldId = await insertWorlds(db, ownerId, "Capped World",);
    const questId = await insertQuests(db, worldId, creator, "Final Quest", "social", 1, { category: "main", },);
    const quest = await db.selectFrom("quests",).selectAll().where("id", "=", questId,).executeTakeFirstOrThrow();

    await awardQuestCompletionXp(db, quest,);
    await awardQuestCompletionXp(db, quest,); // replay stays deduped

    const rows = await ledgerFor(creator,);
    expect(rows,).toHaveLength(1,);
    expect(rows[0]!.amount,).toBe(QUEST_XP_MINIMUM,);
    expect(rows[0]!.source,).toBe("quest",);
    expect(rows[0]!.reference_id,).toBe(questId,);

    const stats = await db.selectFrom("character_stats",).selectAll().where("actor_id", "=", creator,)
      .executeTakeFirstOrThrow();

    expect(stats.level,).toBe(20,);
    expect(stats.xp,).toBe(355_000 + QUEST_XP_MINIMUM,); // the minimum award still banks
    expect(stats.xp_to_next,).toBe(-1,);
  });

  test("a dangling creator_id pays nothing — no ghost stats or ledger rows", async () => {
    // character_stats / xp_ledger carry no FK to actors, so the leg verifies
    // creator existence at the service level before awarding.
    await awardQuestCompletionXp(db, {
      id: "q-ghost",
      name: "Ghost Quest",
      creator_id: "actor-never-existed",
    },);

    expect(await statsRowCount("actor-never-existed",),).toBe(0,);
    expect(await ledgerFor("actor-never-existed",),).toHaveLength(0,);
  });
});

// ── Discovery leg reference format ───────────────────────

describe("applyDiscoveryXpLeg reference collisions", () => {
  test("the JSON-pair reference key cannot collide across worlds", async () => {
    // referenceId is JSON.stringify([worldId, locationId]) — an injective
    // encoding, so ("w:1", "boss") and ("w", "1:boss") land on distinct
    // keys and each first discovery pays.
    const explorer = await seedActor("Cartographer",);

    await applyDiscoveryXpLeg(db, explorer, "w:1", "boss",);
    await applyDiscoveryXpLeg(db, explorer, "w", "1:boss",);

    const rows = await ledgerFor(explorer,);
    expect(rows,).toHaveLength(2,);
    expect(rows.map((r,) => r.amount).sort((a, b,) => a - b),).toEqual([50, 50,],);
    expect(new Set(rows.map((r,) => r.reference_id),).size,).toBe(2,);
  });
});

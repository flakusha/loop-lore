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
  test("BUG: double completion in the same tick double-writes and duplicates the sheet", async () => {
    // Concurrent completion paths (progress tick + /quest command racing in
    // one turn) both pass the ledger pre-check before either logs: two
    // ledger rows (2 × 300 XP) and, because character_stats.actor_id has no
    // unique constraint, two stats rows for one actor. Sequential double
    // completion dedupes correctly (covered in xp.test.ts). Flip when the
    // award becomes transactional / key-unique.
    const creator = await seedActor("Raced Creator",);
    const worldId = await insertWorlds(db, ownerId, "Raced World",);
    const questId = await insertQuests(db, worldId, creator, "Race Quest", "social", 1,);
    const quest = await db.selectFrom("quests",).selectAll().where("id", "=", questId,).executeTakeFirstOrThrow();

    await Promise.all([
      awardQuestCompletionXp(db, quest,),
      awardQuestCompletionXp(db, quest,),
    ],);

    const rows = await ledgerFor(creator,);
    expect(rows,).toHaveLength(2,);
    expect(rows.map((r,) => r.amount).sort((a, b,) => a - b),).toEqual([300, 300,],);
    expect(await statsRowCount(creator,),).toBe(2,);
  });

  test("quest XP at MAX_LEVEL floors to a zero-amount ledger row", async () => {
    // xpForQuest derives from xpForLevel(level+1) − xpForLevel(level); both
    // clamp at MAX_LEVEL 20, so the hard-difficulty main quest pays 0 XP —
    // recorded as a real (dedupe-consuming) ledger row.
    const creator = await seedActor("Capped Creator",);
    await insertCharacterStats(db, creator, 10, 10, 10, { level: 20, xp: 355_000, },);
    const worldId = await insertWorlds(db, ownerId, "Capped World",);
    const questId = await insertQuests(db, worldId, creator, "Final Quest", "social", 1, { category: "main", },);
    const quest = await db.selectFrom("quests",).selectAll().where("id", "=", questId,).executeTakeFirstOrThrow();

    await awardQuestCompletionXp(db, quest,);
    await awardQuestCompletionXp(db, quest,); // replay stays deduped

    const rows = await ledgerFor(creator,);
    expect(rows,).toHaveLength(1,);
    expect(rows[0]!.amount,).toBe(0,);
    expect(rows[0]!.source,).toBe("quest",);
    expect(rows[0]!.reference_id,).toBe(questId,);

    const stats = await db.selectFrom("character_stats",).selectAll().where("actor_id", "=", creator,)
      .executeTakeFirstOrThrow();

    expect(stats.level,).toBe(20,);
    expect(stats.xp,).toBe(355_000,);
    expect(stats.xp_to_next,).toBe(-1,);
  });

  test("BUG: a dangling creator_id is paid anyway — ghost stats and ledger rows", async () => {
    // The only guard is `!quest.creator_id`; a non-empty id pointing at a
    // deleted/never-existing actor passes it. character_stats and xp_ledger
    // carry no FK to actors, so ensureCharacterStats happily bootstraps a
    // ghost sheet and pays out. Pinned; flip when existence is verified.
    await awardQuestCompletionXp(db, {
      id: "q-ghost",
      name: "Ghost Quest",
      creator_id: "actor-never-existed",
    },);

    expect(await statsRowCount("actor-never-existed",),).toBe(1,);
    const rows = await ledgerFor("actor-never-existed",);
    expect(rows,).toHaveLength(1,);
    expect(rows[0]!.amount,).toBe(300,); // medium difficulty, level 1
  });
});

// ── Discovery leg reference format ───────────────────────

describe("applyDiscoveryXpLeg reference collisions", () => {
  test("BUG: the 'world:location' concatenation can collide across worlds", async () => {
    // referenceId is `${worldId}:${locationId}` with no escaping, so
    // ("w:1", "boss") and ("w", "1:boss") both produce "w:1:boss". The
    // second, genuinely distinct discovery dedupes against the first and
    // pays nothing. UUID ids make this unreachable in practice today, but
    // the key is ambiguous by construction — pinned; flip if the format is
    // ever made collision-proof.
    const explorer = await seedActor("Cartographer",);

    await applyDiscoveryXpLeg(db, explorer, "w:1", "boss",);
    await applyDiscoveryXpLeg(db, explorer, "w", "1:boss",);

    const rows = await ledgerFor(explorer,);
    expect(rows,).toHaveLength(1,);
    expect(rows[0]!.reference_id,).toBe("w:1:boss",);
    expect(rows[0]!.amount,).toBe(50,);
  });
});

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/rpg/level/service.test.ts — LevelService pipeline
 *
 * Pins the contract every XP source relies on: NaN/negative/Infinity
 * rejection BEFORE any write, read/ensure of `character_stats`, HP + ASI
 * level-up bookkeeping across multi-level jumps, the max-level sentinel,
 * and the (actor, source, referenceId) dedupe.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, destroyTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertCharacterStats, } from "../../test-utils/insert-helpers";
import { awardXpToActor, ensureCharacterStats, LevelServiceError, } from "./index";

let db: Kysely<DB>;
let actorId: string;

beforeEach(async () => {
  const fixture = await createTestDb();
  db = fixture.db;
  actorId = await insertActors(db, "Progressing Hero", { actor_type: "character", },);
},);

afterEach(async () => {
  await destroyTestDb({ db, sqlite: undefined as never, },);
},);

async function statsRow(actor: string,) {
  return db.selectFrom("character_stats",).selectAll().where("actor_id", "=", actor,).executeTakeFirstOrThrow();
}

async function ledgerRows(actor: string,) {
  return db.selectFrom("xp_ledger",).selectAll().where("actor_id", "=", actor,).execute();
}

describe("awardXpToActor validation", () => {
  test.each([Number.NaN, Infinity, -Infinity, -1, -0.5,],)(
    "rejects invalid amount %s without writing anything",
    async (amount,) => {
      await expect(awardXpToActor(db, { actorId, amount, source: "combat", },),)
        .rejects.toMatchObject({ code: "invalid_amount", name: "LevelServiceError", },);

      expect(await db.selectFrom("character_stats",).selectAll().where("actor_id", "=", actorId,).execute(),)
        .toHaveLength(0,);

      expect(await ledgerRows(actorId,),).toHaveLength(0,);
    },
  );

  test("rejects invalid amounts even for an actor that already has stats", async () => {
    await insertCharacterStats(db, actorId, 10, 10, 10,);
    await expect(awardXpToActor(db, { actorId, amount: Number.NaN, source: "quest", },),)
      .rejects.toBeInstanceOf(LevelServiceError,);

    const row = await statsRow(actorId,);
    expect(row.level,).toBe(1,);
    expect(row.xp,).toBe(0,);
  });

  test("accepts zero as a valid no-op award", async () => {
    const result = await awardXpToActor(db, { actorId, amount: 0, source: "travel", },);
    expect(result.leveledUp,).toBe(false,);
    expect(result.xp,).toBe(0,);
    expect(result.xpToNext,).toBe(300,);
  });
});

describe("awardXpToActor read/ensure", () => {
  test("creates a baseline stats row for a first-time actor", async () => {
    const result = await awardXpToActor(db, { actorId, amount: 50, source: "discovery", },);
    const row = await statsRow(actorId,);
    expect(row.level,).toBe(1,);
    expect(row.xp,).toBe(50,);
    expect(row.xp_to_next,).toBe(250,);
    expect(row.max_hp,).toBe(10,);
    expect(result.hpGained,).toBe(0,);
    expect(result.asiGranted,).toBe(0,);
  });

  test("returns the existing row when the actor already has stats", async () => {
    await insertCharacterStats(db, actorId, 25, 30, 12, { level: 2, xp: 100, con: 14, },);
    const ensured = await ensureCharacterStats(db, actorId,);
    expect(ensured.level,).toBe(2,);
    const count = await db.selectFrom("character_stats",).selectAll().where("actor_id", "=", actorId,).execute();
    expect(count,).toHaveLength(1,);
  });
});

describe("awardXpToActor level-up bookkeeping", () => {
  test("level 1→2 applies hit-die average HP and no ASI", async () => {
    await insertCharacterStats(db, actorId, 10, 10, 10, { hit_dice: '{"die":8}', con: 14, },);
    const result = await awardXpToActor(db, { actorId, amount: 300, source: "combat", },);

    expect(result.leveledUp,).toBe(true,);
    expect(result.levelsGained,).toBe(1,);
    expect(result.hpGained,).toBe(5 + 2,); // avg d8 (5) + CON mod (+2)
    expect(result.asiGranted,).toBe(0,);
    expect(result.xpToNext,).toBe(600,);

    const row = await statsRow(actorId,);
    expect(row.level,).toBe(2,);
    expect(row.max_hp,).toBe(17,);
    expect(row.hp,).toBe(17,);
    expect(row.pending_asi,).toBe(0,);
  });

  test("multi-level jump applies HP per level and ASI at level 4", async () => {
    await insertCharacterStats(db, actorId, 10, 10, 10, { level: 3, xp: 900, con: 10, },);
    const result = await awardXpToActor(db, { actorId, amount: 1800, source: "quest", },);

    expect(result.level,).toBe(4,);
    expect(result.levelsGained,).toBe(1,);
    expect(result.hpGained,).toBe(5,);
    expect(result.asiGranted,).toBe(1,);

    const row = await statsRow(actorId,);
    expect(row.pending_asi,).toBe(1,);
  });

  test("level-up heals current HP but never past the new maximum", async () => {
    await insertCharacterStats(db, actorId, 3, 10, 10, { con: 10, },); // hp 3/10, d8 default
    await awardXpToActor(db, { actorId, amount: 300, source: "combat", },);
    const row = await statsRow(actorId,);
    expect(row.max_hp,).toBe(15,);
    expect(row.hp,).toBe(8,); // 3 + 5, below the new cap
  });

  test("hit die defaults to d8 when hit_dice is the empty JSON default", async () => {
    await insertCharacterStats(db, actorId, 10, 10, 10, { hit_dice: "{}", },);
    const result = await awardXpToActor(db, { actorId, amount: 300, source: "combat", },);
    expect(result.hpGained,).toBe(5,);
  });

  test("max level accrues XP, persists the sentinel, grants nothing further", async () => {
    await insertCharacterStats(db, actorId, 10, 10, 10, { level: 20, xp: 355_000, pending_asi: 0, },);
    const result = await awardXpToActor(db, { actorId, amount: 10_000, source: "combat", },);

    expect(result.level,).toBe(20,);
    expect(result.leveledUp,).toBe(false,);
    expect(result.xp,).toBe(365_000,);
    expect(result.xpToNext,).toBeNull();
    expect(result.hpGained,).toBe(0,);
    expect(result.asiGranted,).toBe(0,);

    const row = await statsRow(actorId,);
    expect(row.xp_to_next,).toBe(-1,);
    expect(row.pending_asi,).toBe(0,);
  });
});

describe("awardXpToActor idempotency", () => {
  test("same (actor, source, referenceId) applies once", async () => {
    const grant = { actorId, amount: 300, source: "combat", referenceId: "battle-1", };
    const first = await awardXpToActor(db, grant,);
    const second = await awardXpToActor(db, grant,);

    expect(first.deduped,).toBe(false,);
    expect(first.leveledUp,).toBe(true,);
    expect(second.deduped,).toBe(true,);
    expect(second.leveledUp,).toBe(false,);
    expect(second.ledgerId,).toBe(first.ledgerId,);

    const row = await statsRow(actorId,);
    expect(row.level,).toBe(2,);
    expect(row.xp,).toBe(300,);
    expect(await ledgerRows(actorId,),).toHaveLength(1,);
  });

  test("same referenceId from a different source is a distinct grant", async () => {
    await awardXpToActor(db, { actorId, amount: 10, source: "combat", referenceId: "ref-1", },);
    await awardXpToActor(db, { actorId, amount: 10, source: "quest", referenceId: "ref-1", },);
    expect(await ledgerRows(actorId,),).toHaveLength(2,);
  });

  test("same source+reference for a different actor is a distinct grant", async () => {
    const other = await insertActors(db, "Other Hero", { actor_type: "character", },);
    await awardXpToActor(db, { actorId, amount: 10, source: "combat", referenceId: "ref-1", },);
    await awardXpToActor(db, { actorId: other, amount: 10, source: "combat", referenceId: "ref-1", },);
    expect(await ledgerRows(actorId,),).toHaveLength(1,);
    expect(await ledgerRows(other,),).toHaveLength(1,);
  });

  test("grants without a referenceId never dedupe", async () => {
    await awardXpToActor(db, { actorId, amount: 10, source: "combat", },);
    await awardXpToActor(db, { actorId, amount: 10, source: "combat", },);
    expect(await ledgerRows(actorId,),).toHaveLength(2,);
  });
});

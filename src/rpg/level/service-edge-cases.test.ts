// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/rpg/level/service-edge-cases.test.ts — adversarial edges of the
 * LevelService pipeline that `service.test.ts` does not cover.
 *
 * Assertions marked BUG pin current behavior on purpose so a future fix
 * flips exactly one assertion; the findings are reported in the epic notes.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertCharacterStats, } from "../../test-utils/insert-helpers";
import { asiRemaining, } from "../xp/levelup.js";
import { awardXpToActor, } from "./index";

let db: Kysely<DB>;
let fixture: TestDb;
let actorId: string;

beforeEach(async () => {
  fixture = await createTestDb();
  db = fixture.db;
  actorId = await insertActors(db, "Edge Hero", { actor_type: "character", },);
},);

afterEach(async () => {
  await destroyTestDb(fixture,);
},);

// Shared row projections used across ≥3 tests (mirrors service.test.ts).
async function statsRow(actor: string,) {
  return db.selectFrom("character_stats",).selectAll().where("actor_id", "=", actor,).executeTakeFirstOrThrow();
}

async function statsRowCount(actor: string,) {
  const rows = await db.selectFrom("character_stats",).selectAll().where("actor_id", "=", actor,).execute();
  return rows.length;
}

async function ledgerRows(actor: string,) {
  return db.selectFrom("xp_ledger",).selectAll().where("actor_id", "=", actor,).execute();
}

// ── Ledger dedupe collisions ─────────────────────────────

describe("awardXpToActor dedupe collisions", () => {
  test("concurrent-shaped re-entry (Promise.all) applies exactly once", async () => {
    // The (actor, source, reference_id) UNIQUE index plus the award
    // transaction make the loser downgrade to a replay: one ledger row, one
    // sheet, one applied grant.
    const grant = { actorId, amount: 300, source: "combat", referenceId: "race-1", };
    const [first, second,] = await Promise.all([
      awardXpToActor(db, grant,),
      awardXpToActor(db, grant,),
    ],);

    // Exactly one call applies; the other replays as deduped.
    expect(first.deduped,).not.toBe(second.deduped,);
    expect([first.deduped, second.deduped,],).toContain(false,);
    expect([first.deduped, second.deduped,],).toContain(true,);

    const ledger = await ledgerRows(actorId,);
    expect(ledger,).toHaveLength(1,);
    expect(ledger.reduce((sum, row,) => sum + row.amount, 0,),).toBe(300,);

    const row = await statsRow(actorId,);
    expect(row.level,).toBe(2,);
    expect(row.xp,).toBe(300,);
    expect(await statsRowCount(actorId,),).toBe(1,);
  });

  test("a ledger-only partial failure reconciles the stale sheet on replay", async () => {
    // Simulates a crash that persisted the ledger row without applying the
    // level-up (a manual/legacy row). The replay detects the stale sheet
    // (xp below the recorded amount) inside the transaction and re-applies
    // the recorded grant — the ledger row stays untouched.
    await db.insertInto("xp_ledger",).values({
      id: "ledger-orphan",
      actor_id: actorId,
      amount: 300,
      source: "combat",
      reference_id: "battle-orphan",
    },).execute();

    const result = await awardXpToActor(db, {
      actorId,
      amount: 300,
      source: "combat",
      referenceId: "battle-orphan",
    },);

    expect(result.deduped,).toBe(true,);
    expect(result.leveledUp,).toBe(true,);
    expect(result.xpToNext,).toBe(600,); // level 2 → next threshold 900

    const row = await statsRow(actorId,);
    expect(row.level,).toBe(2,);
    expect(row.xp,).toBe(300,);
    expect(row.xp_to_next,).toBe(600,); // the computed next-threshold
    expect(await ledgerRows(actorId,),).toHaveLength(1,); // no double-write
  });

  test("empty-string referenceId is a real dedupe key; undefined never dedupes against it", async () => {
    const empty = { actorId, amount: 10, source: "combat", referenceId: "", };
    const first = await awardXpToActor(db, empty,);
    const second = await awardXpToActor(db, empty,);

    expect(first.deduped,).toBe(false,);
    expect(second.deduped,).toBe(true,);

    const rows = await ledgerRows(actorId,);
    expect(rows,).toHaveLength(1,);
    expect(rows[0]!.reference_id,).toBe("",);

    // A grant with no referenceId is a distinct award, not a collision with "".
    await awardXpToActor(db, { actorId, amount: 10, source: "combat", },);
    expect(await ledgerRows(actorId,),).toHaveLength(2,);
  });
});

// ── Level boundaries ─────────────────────────────────────

describe("awardXpToActor level boundaries", () => {
  test("exactly-enough XP reaches the next level; one XP less does not", async () => {
    await insertCharacterStats(db, actorId, 10, 10, 10, { level: 1, xp: 0, },);
    const exact = await awardXpToActor(db, { actorId, amount: 300, source: "combat", },);
    expect(exact.level,).toBe(2,);
    expect(exact.leveledUp,).toBe(true,);
    expect(exact.xpToNext,).toBe(600,);

    const short = await insertActors(db, "Edge Short", { actor_type: "character", },);
    await insertCharacterStats(db, short, 10, 10, 10, { level: 1, xp: 0, },);
    const almost = await awardXpToActor(db, { actorId: short, amount: 299, source: "combat", },);
    expect(almost.level,).toBe(1,);
    expect(almost.leveledUp,).toBe(false,);
    expect(almost.xp,).toBe(299,);
    expect(almost.xpToNext,).toBe(1,);
  });

  test("multi-level jump 3→6 across the level-4 ASI grants one ASI and per-level HP", async () => {
    await insertCharacterStats(db, actorId, 10, 10, 10, { level: 3, xp: 900, con: 10, },);
    const result = await awardXpToActor(db, { actorId, amount: 13_100, source: "quest", },);

    expect(result.level,).toBe(6,);
    expect(result.levelsGained,).toBe(3,);
    expect(result.hpGained,).toBe(15,); // 3 levels × (avg d8 5 + CON 0)
    expect(result.asiGranted,).toBe(1,); // exactly level 4 sits in the jump
    expect(result.xpToNext,).toBe(9_000,);

    const row = await statsRow(actorId,);
    expect(row.level,).toBe(6,);
    expect(row.xp,).toBe(14_000,);
    expect(row.max_hp,).toBe(25,);
    expect(row.pending_asi,).toBe(1,);
    // Budget view after the jump: 8/12/16/19 are still unspent.
    expect(asiRemaining(6,),).toBe(4,);
  });

  test.each([
    { die: 12, con: 14, expected: 18, }, // 2 × (avg d12 7 + CON +2)
    { die: 8, con: 10, expected: 10, }, // 2 × 5
    { die: 4, con: 8, expected: 4, }, // 2 × (avg d4 3 + CON −1)
    { die: 3, con: 10, expected: 4, }, // unlisted die: 2 × ceil(3/2)
    { die: 100, con: 10, expected: 100, }, // huge unlisted die: 2 × ceil(50)
  ],)(
    "HP accumulates across hit-die boundaries: d$die CON $con → $expected for two levels",
    async ({ die, con, expected, },) => {
      await insertCharacterStats(db, actorId, 10, 10, 10, {
        hit_dice: JSON.stringify({ die, },),
        con,
      },);

      const result = await awardXpToActor(db, { actorId, amount: 900, source: "combat", },);
      expect(result.levelsGained,).toBe(2,);
      expect(result.hpGained,).toBe(expected,);
      const row = await statsRow(actorId,);
      expect(row.max_hp,).toBe(10 + expected,);
    },
  );

  test("a crushing CON modifier never drives level-up HP below 1", async () => {
    // CON 1 → modifier −4; avg d4 (3) − 4 = −1, clamped to 1 per level.
    await insertCharacterStats(db, actorId, 10, 10, 10, { hit_dice: '{"die":4}', con: 1, },);
    const result = await awardXpToActor(db, { actorId, amount: 900, source: "combat", },);
    expect(result.levelsGained,).toBe(2,);
    expect(result.hpGained,).toBe(2,);
    const row = await statsRow(actorId,);
    expect(row.max_hp,).toBe(12,);
  });

  test.each([
    { raw: '{"die":', expected: 5, note: "unparseable JSON", },
    { raw: '{"die":"12"}', expected: 5, note: "string die value", },
    { raw: '{"die":0}', expected: 5, note: "sub-1 die value", },
    { raw: '{"die":null}', expected: 5, note: "null die value", },
    { raw: '{"hitDie":12}', expected: 7, note: "alternate hitDie key is honored", },
  ],)(
    "hit_dice fallback: $note → d8 baseline unless a usable die is recorded",
    async ({ raw, expected, },) => {
      await insertCharacterStats(db, actorId, 10, 10, 10, { hit_dice: raw, },);
      const result = await awardXpToActor(db, { actorId, amount: 300, source: "combat", },);
      expect(result.hpGained,).toBe(expected,);
    },
  );

  test("a first-time actor with no stats row bootstraps d8 defaults and levels immediately", async () => {
    expect(await statsRowCount(actorId,),).toBe(0,);
    const result = await awardXpToActor(db, { actorId, amount: 300, source: "discovery", },);

    expect(result.level,).toBe(2,);
    expect(result.hpGained,).toBe(5,); // ensured row has hit_dice "{}" → d8, CON 10
    const row = await statsRow(actorId,);
    expect(row.max_hp,).toBe(15,);
    expect(row.hp,).toBe(15,);
    expect(row.hit_dice,).toBe("{}",);
  });

  test("hitting MAX_LEVEL exactly persists the sentinel; overflow awards never go negative", async () => {
    await insertCharacterStats(db, actorId, 10, 10, 10, { level: 19, xp: 305_000, con: 10, },);
    const toCap = await awardXpToActor(db, { actorId, amount: 50_000, source: "combat", },);

    expect(toCap.level,).toBe(20,);
    expect(toCap.leveledUp,).toBe(true,);
    expect(toCap.xpToNext,).toBeNull();
    expect(toCap.hpGained,).toBe(5,); // only level 20 gained
    expect(toCap.asiGranted,).toBe(0,); // 20 is not an ASI level
    expect((await statsRow(actorId,)).xp_to_next,).toBe(-1,);

    // Overflow past the cap: XP accrues, level and sentinel hold, nothing negative.
    const overflow = await awardXpToActor(db, { actorId, amount: 12_345, source: "combat", },);
    expect(overflow.level,).toBe(20,);
    expect(overflow.leveledUp,).toBe(false,);
    expect(overflow.xp,).toBe(367_345,);
    expect(overflow.xpToNext,).toBeNull();
    expect(overflow.hpGained,).toBe(0,);

    const row = await statsRow(actorId,);
    expect(row.xp_to_next,).toBe(-1,);
    expect(row.xp,).toBeGreaterThanOrEqual(0,);
    expect(await ledgerRows(actorId,),).toHaveLength(2,);
  });
});

// ── Input fuzz ───────────────────────────────────────────

describe("awardXpToActor input fuzz", () => {
  test.each(["300", "1e3", "", " 300 ",],)(
    "string amount %p is rejected without coercion and writes nothing",
    async (amount,) => {
      await expect(awardXpToActor(db, {
        actorId,
        amount: amount as unknown as number,
        source: "fuzz",
      },),).rejects.toMatchObject({ code: "invalid_amount", name: "LevelServiceError", },);

      expect(await statsRowCount(actorId,),).toBe(0,);
      expect(await ledgerRows(actorId,),).toHaveLength(0,);
    },
  );

  test("-0 is accepted and normalizes to +0 everywhere", async () => {
    const result = await awardXpToActor(db, { actorId, amount: -0, source: "fuzz", },);

    // `toBe` uses Object.is, so this also proves the result is not −0.
    expect(result.xp,).toBe(0,);
    expect(result.xpToNext,).toBe(300,);
    expect(result.leveledUp,).toBe(false,);

    // The integer column normalizes the bind to +0.
    const ledger = await ledgerRows(actorId,);
    expect(ledger,).toHaveLength(1,);
    expect(ledger[0]!.amount === 0,).toBe(true,);
    expect(Object.is(ledger[0]!.amount, -0,),).toBe(false,);
  });

  test("an amount beyond MAX_SAFE_INTEGER is clamped to it", async () => {
    // Contract: integer amounts above the safe-integer ceiling are clamped
    // (precision is already lost past it; integer columns could not hold
    // the raw value anyway). Max level is still reached.
    const overMax = Number.MAX_SAFE_INTEGER + 1;
    const result = await awardXpToActor(db, { actorId, amount: overMax, source: "fuzz", },);

    expect(result.level,).toBe(20,);
    expect(result.levelsGained,).toBe(19,);
    expect(result.asiGranted,).toBe(5,);
    expect(result.hpGained,).toBe(95,); // 19 × (avg d8 5 + CON 0)
    expect(result.xp,).toBe(Number.MAX_SAFE_INTEGER,);
    expect(result.xpToNext,).toBeNull();
    expect((await statsRow(actorId,)).xp_to_next,).toBe(-1,);
    expect((await ledgerRows(actorId,))[0]!.amount,).toBe(Number.MAX_SAFE_INTEGER,);
  });

  test.each([150.5, 0.5, Number.EPSILON,],)(
    "fractional XP %p is rejected without rounding and writes nothing",
    async (amount,) => {
      // Contract: integer amounts only — the ledger and sheet columns are
      // integer-affinity and the threshold math is integral.
      await expect(awardXpToActor(db, { actorId, amount, source: "fuzz", },),)
        .rejects.toMatchObject({ code: "invalid_amount", name: "LevelServiceError", },);

      expect(await statsRowCount(actorId,),).toBe(0,);
      expect(await ledgerRows(actorId,),).toHaveLength(0,);
    },
  );
});

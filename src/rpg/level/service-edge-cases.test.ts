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
import { awardXpToActor, LevelServiceError, } from "./index";

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
  test("BUG: concurrent-shaped re-entry (Promise.all) double-writes the ledger and the stats row", async () => {
    // The dedupe pre-check races: both calls observe an empty xp_ledger
    // before either logs, so both apply. The sheet is also duplicated because
    // `character_stats.actor_id` carries no unique constraint. The docstring
    // contract ("a replay resolves to the already-recorded state and applies
    // nothing") only holds for sequential replays. Flip these assertions
    // when the award becomes transactional / key-unique.
    const grant = { actorId, amount: 300, source: "combat", referenceId: "race-1", };
    const [first, second,] = await Promise.all([
      awardXpToActor(db, grant,),
      awardXpToActor(db, grant,),
    ],);

    expect(first.deduped,).toBe(false,);
    expect(second.deduped,).toBe(false,);

    const ledger = await ledgerRows(actorId,);
    expect(ledger,).toHaveLength(2,);
    // The ledger now records 600 XP while the sheet shows 300: the two
    // writes agree on absolute values, so the sheet self-corrects, but the
    // audit trail double-counts.
    expect(ledger.reduce((sum, row,) => sum + row.amount, 0,),).toBe(600,);

    const row = await statsRow(actorId,);
    expect(row.level,).toBe(2,);
    expect(row.xp,).toBe(300,);
    expect(await statsRowCount(actorId,),).toBe(2,);
  });

  test("BUG: a ledger-only partial failure dedupes forever and never repairs the sheet", async () => {
    // Simulates a crash that persisted the ledger row without applying the
    // level-up (the reverse write order the pipeline cannot produce itself,
    // but a manual/legacy row can). The replay resolves to "already
    // recorded" and leaves the character at level 1 with 0 XP.
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
    expect(result.leveledUp,).toBe(false,);
    // The dedupe path bootstraps the missing sheet and leaves it at the
    // create defaults; the computed next-threshold (300) is never written.
    expect(result.xpToNext,).toBe(300,);

    const row = await statsRow(actorId,);
    expect(row.level,).toBe(1,);
    expect(row.xp,).toBe(0,);
    expect(row.xp_to_next,).toBe(0,); // bootstrap default, not the computed 300
    expect(await ledgerRows(actorId,),).toHaveLength(1,);
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

  test("BUG (doc gap): MAX_SAFE_INTEGER + 1 is accepted and teleports to max level", async () => {
    // The documented contract is only "finite, non-negative", so a
    // precision-lost amount sails through validation and instantly grants
    // level 20 with five ASIs. There is no upper bound; flagged as a
    // validation-contract gap rather than rejected here.
    const overMax = Number.MAX_SAFE_INTEGER + 1;
    const result = await awardXpToActor(db, { actorId, amount: overMax, source: "fuzz", },);

    expect(result.level,).toBe(20,);
    expect(result.levelsGained,).toBe(19,);
    expect(result.asiGranted,).toBe(5,);
    expect(result.hpGained,).toBe(95,); // 19 × (avg d8 5 + CON 0)
    expect(result.xp,).toBe(overMax,);
    expect(result.xpToNext,).toBeNull();
    expect((await statsRow(actorId,)).xp_to_next,).toBe(-1,);
  });

  test("BUG (doc gap): fractional XP is accepted and persisted as a float", async () => {
    // `AwardXpInput.amount` is typed `number` and only requires finite and
    // non-negative, so 150.5 applies and xp / xp_to_next become fractional —
    // despite integer-affinity columns and integer XP thresholds. Pinned.
    const result = await awardXpToActor(db, { actorId, amount: 150.5, source: "fuzz", },);

    expect(result.level,).toBe(1,);
    expect(result.xp,).toBe(150.5,);
    expect(result.xpToNext,).toBe(149.5,);

    const row = await statsRow(actorId,);
    expect(row.xp,).toBe(150.5,);
    expect(row.xp_to_next,).toBe(149.5,);

    const ledger = await ledgerRows(actorId,);
    expect(ledger[0]!.amount,).toBe(150.5,);
  });
});

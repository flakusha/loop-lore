// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/rpg/service/battles-rewards.edge-cases.test.ts — adversarial edges of
 * the battle victory XP leg that `battles-rewards.test.ts` does not cover.
 *
 * Assertions marked BUG pin current behavior on purpose so a future fix
 * flips exactly one assertion; the findings are reported in the epic notes.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import type { Combatant, } from "../../rpg/combat.js";
import type { StatBlock, } from "../../rpg/stats.js";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../../test-utils/insert-helpers";
import { applyVictoryXpLeg, } from "./battles/rewards.js";
import { buildCombatant, } from "./battles/types.js";

let db: Kysely<DB>;
let fixture: TestDb;
let ownerId: string;

const stats: StatBlock = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, };

beforeEach(async () => {
  fixture = await createTestDb();
  db = fixture.db;
  ownerId = await insertUsers(db, "edges-owner", "Edges Owner",);
},);

afterEach(async () => {
  await destroyTestDb(fixture,);
},);

/** Seed an actor id so battle rosters carry real participants. */
async function seedActor(name: string,): Promise<string> {
  return insertActors(db, name, { user_id: ownerId, actor_type: "character", },);
}

/** Combatant with a controllable level (the CR proxy) and hp (0 = fallen). */
function combatant(id: string, name: string, opts: {
  level?: number;
  hp?: number;
  isNpc?: boolean;
} = {},): Combatant {
  return buildCombatant(id, name, stats, opts.level ?? 5, opts.hp ?? 30, 12, opts.isNpc ?? false,);
}

// Shared projections used across ≥3 tests.
async function ledgerFor(actorId: string,) {
  return db.selectFrom("xp_ledger",).selectAll().where("actor_id", "=", actorId,).execute();
}

async function statsFor(actorId: string,) {
  return db.selectFrom("character_stats",).selectAll().where("actor_id", "=", actorId,).executeTakeFirstOrThrow();
}

function ctxFor(battleId: string, combatants: Combatant[],) {
  return { battleId, chatId: "chat-edges", combatants, };
}

describe("applyVictoryXpLeg edges", () => {
  test("a survivor who joined mid-battle earns the full equal share", async () => {
    // Combatant carries no join-time field, so every hp>0 party member in the
    // final roster splits fallen XP equally — the documented contract, not
    // prorated. Pinned so a later proration change is a conscious flip.
    const early = await seedActor("Early Blade",);
    const late = await seedActor("Late Joiner",);

    await applyVictoryXpLeg(
      db,
      ctxFor("battle-late", [
        combatant(early, "Early Blade", { hp: 10, },),
        combatant(late, "Late Joiner", { hp: 4, },),
        combatant("foe-late", "Ogre", { isNpc: true, hp: 0, level: 2, },),
      ],),
    );

    for (const hero of [early, late,]) {
      const rows = await ledgerFor(hero,);
      expect(rows,).toHaveLength(1,);
      expect(rows[0]!.amount,).toBe(225,); // floor(450 / 2) — full share, no proration
    }
  });

  test("a foe level outside the CR table falls back to the flat 100 XP proxy", async () => {
    // CR proxy is the NPC combatant's `level`; levels missing from XP_BY_CR
    // (99, fractional 7.5) each fall back to 100 base XP.
    const hero = await seedActor("Cr Scholar",);

    await applyVictoryXpLeg(
      db,
      ctxFor("battle-uncr", [
        combatant(hero, "Cr Scholar", { hp: 10, },),
        combatant("foe-x", "Void Horror", { isNpc: true, hp: 0, level: 99, },),
        combatant("foe-y", "Half Ogre", { isNpc: true, hp: 0, level: 7.5, },),
      ],),
    );

    const rows = await ledgerFor(hero,);
    expect(rows,).toHaveLength(1,);
    expect(rows[0]!.amount,).toBe(100 + 100,);
  });

  test("BUG: a huge party floors the split to 0 XP but still consumes every dedupe key", async () => {
    // floor(200 / 201) = 0: each of the 201 survivors gets a zero-amount
    // ledger row keyed to the battle id. The replay guard is therefore
    // spent even though nobody earned anything — a re-run with a corrected
    // split could never pay. Pinned; flip when zero-awards skip the ledger.
    const army: string[] = [];
    const combatants: Combatant[] = [];
    for (let i = 0; i < 201; i++) {
      const grunt = await seedActor(`Grunt ${i}`,);
      army.push(grunt,);
      combatants.push(combatant(grunt, `G${i}`, { hp: 1, level: 1, },),);
    }

    combatants.push(combatant("foe-army", "CR 1 Foe", { isNpc: true, hp: 0, level: 1, },),);

    await applyVictoryXpLeg(db, ctxFor("battle-army", combatants,),);

    const rows = await db.selectFrom("xp_ledger",).selectAll().where("reference_id", "=", "battle-army",).execute();
    expect(rows,).toHaveLength(201,);
    for (const row of rows) {
      expect(row.amount,).toBe(0,);
      expect(row.source,).toBe("combat",);
    }

    // Nobody leveled, nobody gained, but every key is burned.
    const first = await statsFor(army[0]!,);
    expect(first.xp,).toBe(0,);
    expect(first.level,).toBe(1,);
  });

  test("the same actor listed twice among survivors is paid once — at a diluted split", async () => {
    // The loop awards per roster entry; the second entry hits the battle-id
    // dedupe key written by the first and short-circuits. But survivors.length
    // counts BOTH entries, so the split is floor(200 / 2) = 100: the echo
    // halves the payout and the duplicate's share evaporates. Pinned; flip
    // when roster entries are deduped before the split.
    const hero = await seedActor("Double Listed",);

    await applyVictoryXpLeg(
      db,
      ctxFor("battle-double", [
        combatant(hero, "Double Listed", { hp: 10, },),
        combatant(hero, "Double Listed (echo)", { hp: 6, },),
        combatant("foe-d", "Bandit", { isNpc: true, hp: 0, level: 1, },),
      ],),
    );

    const rows = await ledgerFor(hero,);
    expect(rows,).toHaveLength(1,);
    expect(rows[0]!.amount,).toBe(100,);
    expect((await statsFor(hero,)).xp,).toBe(100,);
  });

  test("BUG: a replay after the stats row is deleted re-bootstraps but never restores the award", async () => {
    const hero = await seedActor("Wiped Sheet",);
    const ctx = ctxFor("battle-wipe", [
      combatant(hero, "Wiped Sheet", { hp: 10, },),
      combatant("foe-w", "Orc", { isNpc: true, hp: 0, level: 1, },),
    ],);

    await applyVictoryXpLeg(db, ctx,);
    expect((await statsFor(hero,)).xp,).toBe(200,);

    await db.deleteFrom("character_stats",).where("actor_id", "=", hero,).execute();
    await applyVictoryXpLeg(db, ctx,);

    // No throw (best-effort leg), no second payment — but the fresh baseline
    // row keeps level 1 / xp 0: the dedupe short-circuit trusts the ledger
    // and never re-applies the lost XP to the sheet.
    expect(await ledgerFor(hero,),).toHaveLength(1,);
    const row = await statsFor(hero,);
    expect(row.level,).toBe(1,);
    expect(row.xp,).toBe(0,);
  });

  test("BUG: a bootstrap failure is swallowed and starves every later survivor", async () => {
    // Dropping the sheet makes ensureCharacterStats throw for the first
    // survivor; the single try/catch around the whole loop (rewards.ts)
    // swallows it and abandons survivor two — per-participant isolation is
    // absent. Pinned; flip when each survivor is wrapped individually.
    const first = await seedActor("First Unlucky",);
    const second = await seedActor("Second Unlucky",);

    await db.schema.dropTable("character_stats",).execute();
    await expect(applyVictoryXpLeg(
      db,
      ctxFor("battle-starve", [
        combatant(first, "First Unlucky", { hp: 10, },),
        combatant(second, "Second Unlucky", { hp: 10, },),
        combatant("foe-s", "Goblin", { isNpc: true, hp: 0, level: 1, },),
      ],),
    ),).resolves.toBeUndefined();

    expect(await db.selectFrom("xp_ledger",).selectAll().where("reference_id", "=", "battle-starve",).execute(),)
      .toHaveLength(0,);
  });
});

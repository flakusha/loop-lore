// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/rpg/level/growth.test.ts — organic stat drift
 *
 * Pins the activity weighting (xp_ledger source mix → ability), the 18
 * cap, the static-mode no-op, the growth_log audit row, and the
 * no-activity fallback.
 */
import { beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema.js";
import { createLogger, } from "../../logger/index.js";
import { createTestDb, } from "../../test-utils/create-test-db.js";
import { insertActors, insertCharacterStats, insertUsers, } from "../../test-utils/insert-helpers.js";
import { logXp, } from "../service/xp.js";
import { applyOrganicGrowth, ORGANIC_GROWTH_CAP, } from "./growth.js";

let db: Kysely<DB>;
let ownerId: string;

beforeAll(async () => {
  db = (await createTestDb()).db;
  createLogger({ level: "error", },);
  ownerId = await insertUsers(db, "growth-owner", "Growth Owner",);
},);

async function seedActor(name: string, opts: {
  growthMode?: string;
  stats?: { str?: number; dex?: number; con?: number; int?: number; wis?: number; cha?: number };
} = {},): Promise<string> {
  const actorId = await insertActors(db, name, {
    user_id: ownerId,
    actor_type: "character",
    growth_mode: opts.growthMode ?? "dynamic",
  },);

  await insertCharacterStats(db, actorId, 10, 10, 10, opts.stats,);
  return actorId;
}

async function statsOf(actorId: string,) {
  return db.selectFrom("character_stats",).selectAll().where("actor_id", "=", actorId,).executeTakeFirstOrThrow();
}

async function driftRows(actorId: string,) {
  return db.selectFrom("growth_log",).selectAll()
    .where("actor_id", "=", actorId,)
    .where("axis", "=", "stat",)
    .execute();
}

describe("applyOrganicGrowth", () => {
  test("weights the drift by the xp_ledger source mix", async () => {
    const actor = await seedActor("Fighter Mix",);
    await logXp({ database: db, }, { actorId: actor, amount: 5000, source: "combat", },);
    await logXp({ database: db, }, { actorId: actor, amount: 10, source: "discovery", },);

    const result = await applyOrganicGrowth(db, actor,);

    expect(result.applied,).toBe(true,);
    expect(result.ability,).toBe("str",); // combat→str dominates
    const row = await statsOf(actor,);
    expect(row.str,).toBe(11,);
  });

  test("breaks ties in canonical ability order", async () => {
    const actor = await seedActor("Tie Actor",);
    await logXp({ database: db, }, { actorId: actor, amount: 100, source: "combat", },);
    await logXp({ database: db, }, { actorId: actor, amount: 100, source: "travel", },);

    const result = await applyOrganicGrowth(db, actor,);
    // combat (str) and travel (dex) weigh the same → str wins canonically.
    expect(result.ability,).toBe("str",);
  });

  test("respects the organic cap and moves to the next candidate", async () => {
    const actor = await seedActor("Capped Fighter", {
      stats: { str: ORGANIC_GROWTH_CAP, dex: 10, },
    },);

    await logXp({ database: db, }, { actorId: actor, amount: 9000, source: "combat", },);

    const result = await applyOrganicGrowth(db, actor,);
    expect(result.applied,).toBe(true,);
    expect(result.ability,).toBe("dex",); // str capped → next weighted candidate
  });

  test("reports all_capped when every ability sits at the cap", async () => {
    const capped = ORGANIC_GROWTH_CAP;
    const actor = await seedActor("Maxed Actor", {
      stats: { str: capped, dex: capped, con: capped, int: capped, wis: capped, cha: capped, },
    },);

    await logXp({ database: db, }, { actorId: actor, amount: 100, source: "combat", },);

    const result = await applyOrganicGrowth(db, actor,);
    expect(result.applied,).toBe(false,);
    expect(result.reason,).toBe("all_capped",);
  });

  test("static growth_mode is a no-op with no audit row", async () => {
    const actor = await seedActor("Frozen Actor", { growthMode: "static", },);
    await logXp({ database: db, }, { actorId: actor, amount: 500, source: "combat", },);

    const result = await applyOrganicGrowth(db, actor,);
    expect(result.applied,).toBe(false,);
    expect(result.reason,).toBe("static_mode",);
    expect((await statsOf(actor,)).str,).toBe(10,);
    expect(await driftRows(actor,),).toHaveLength(0,);
  });

  test("no ledger activity falls back to CON", async () => {
    const actor = await seedActor("Quiet Actor",);
    const result = await applyOrganicGrowth(db, actor,);
    expect(result.applied,).toBe(true,);
    expect(result.ability,).toBe("con",);
    expect((await statsOf(actor,)).con,).toBe(11,);
  });

  test("every applied drift writes a stat growth_log row", async () => {
    const actor = await seedActor("Audited Actor",);
    await logXp({ database: db, }, { actorId: actor, amount: 200, source: "combat", },);
    await applyOrganicGrowth(db, actor,);

    const rows = await driftRows(actor,);
    expect(rows,).toHaveLength(1,);
    expect(rows[0]!.event_type,).toBe("stat_drifted",);
    expect(rows[0]!.subject_id,).toBe("str",);
    expect(JSON.parse(rows[0]!.before_json!,),).toEqual({ str: 10, },);
    expect(JSON.parse(rows[0]!.after_json!,),).toEqual({ str: 11, },);
  });
});

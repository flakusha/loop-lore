// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/rpg/level/level-audit.test.ts — level-up growth_log audit
 *
 * Pins the epic-character-xp-leveling contract: every level gained writes
 * one `growth_log` row (axis='stat', event 'level_up', before/after level
 * JSON); awards that gain no level write nothing; static-mode actors
 * still level with no audit row and no throw.
 */
import { beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema.js";
import { createLogger, } from "../../logger/index.js";
import { createTestDb, } from "../../test-utils/create-test-db.js";
import { insertActors, insertCharacterStats, insertUsers, } from "../../test-utils/insert-helpers.js";
import { awardXpToActor, } from "./index.js";
import { auditLevelUp, } from "./level-audit.js";

let db: Kysely<DB>;
let ownerId: string;
let actorId: string;

beforeAll(async () => {
  db = (await createTestDb()).db;
  createLogger({ level: "error", },);
  ownerId = await insertUsers(db, "audit-owner", "Audit Owner",);
},);

beforeEach(async () => {
  actorId = await insertActors(db, "Audited Hero", {
    user_id: ownerId,
    actor_type: "character",
  },);
},);

async function levelAuditRows(actor: string,) {
  return db.selectFrom("growth_log",).selectAll()
    .where("actor_id", "=", actor,)
    .where("axis", "=", "stat",)
    .where("event_type", "=", "level_up",)
    .orderBy("recorded_at", "asc",)
    .execute();
}

describe("level-up growth_log audit", () => {
  test("single level-up writes one row with before/after level", async () => {
    await insertCharacterStats(db, actorId, 10, 10, 10, { hit_dice: '{"die":8}', },);
    const result = await awardXpToActor(db, { actorId, amount: 300, source: "combat", },);
    expect(result.leveledUp,).toBe(true,);

    const rows = await levelAuditRows(actorId,);
    expect(rows,).toHaveLength(1,);
    expect(rows[0]!.subject_kind,).toBe("level",);
    expect(rows[0]!.subject_id,).toBe("2",);
    expect(JSON.parse(rows[0]!.before_json!,),).toEqual({ level: 1, },);
    expect(JSON.parse(rows[0]!.after_json!,),).toEqual({ level: 2, },);
  });

  test("multi-level jump writes one row per level", async () => {
    await insertCharacterStats(db, actorId, 10, 10, 10, { level: 1, xp: 0, },);
    const result = await awardXpToActor(db, { actorId, amount: 2700, source: "quest", },);
    expect(result.level,).toBe(4,);

    const rows = await levelAuditRows(actorId,);
    expect(rows.map((r,) => r.subject_id),).toEqual(["2", "3", "4",],);
    expect(JSON.parse(rows[0]!.before_json!,),).toEqual({ level: 1, },);
    expect(JSON.parse(rows[2]!.after_json!,),).toEqual({ level: 4, },);
  });

  test("award without level-up writes no audit row", async () => {
    await insertCharacterStats(db, actorId, 10, 10, 10,);
    const result = await awardXpToActor(db, { actorId, amount: 100, source: "combat", },);
    expect(result.leveledUp,).toBe(false,);
    expect(await levelAuditRows(actorId,),).toHaveLength(0,);
  });

  test("static-mode actor still levels with no audit row and no throw", async () => {
    const frozen = await insertActors(db, "Frozen Hero", {
      user_id: ownerId,
      actor_type: "character",
      growth_mode: "static",
    },);

    await insertCharacterStats(db, frozen, 10, 10, 10, { hit_dice: '{"die":8}', },);

    const result = await awardXpToActor(db, { actorId: frozen, amount: 300, source: "combat", },);
    expect(result.level,).toBe(2,);
    expect(await levelAuditRows(frozen,),).toHaveLength(0,);
  });

  test("auditLevelUp is a no-op for equal levels and swallows write failures", async () => {
    await insertCharacterStats(db, actorId, 10, 10, 10,);
    await auditLevelUp(db, actorId, 3, 3,);
    expect(await levelAuditRows(actorId,),).toHaveLength(0,);

    await db.deleteFrom("growth_log",).where("actor_id", "=", actorId,).execute();
    await auditLevelUp(db, "missing-actor", 1, 3,);
    expect(await levelAuditRows("missing-actor",),).toHaveLength(0,);
  });
});

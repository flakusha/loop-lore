// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/rpg/level/asi.test.ts — allocatable ASI points
 *
 * Boundary behavior: validation, budget decrement, ASI_MAX clamp,
 * over-ask clamping, and error paths.
 */
import { beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema.js";
import { createLogger, } from "../../logger/index.js";
import { createTestDb, } from "../../test-utils/create-test-db.js";
import { insertActors, insertCharacterStats, insertUsers, } from "../../test-utils/insert-helpers.js";
import { allocateAsi, LevelServiceError, } from "./index.js";

let db: Kysely<DB>;
let ownerId: string;

beforeAll(async () => {
  db = (await createTestDb()).db;
  createLogger({ level: "error", },);
  ownerId = await insertUsers(db, "asi-owner", "ASI Owner",);
},);

async function seedActor(name: string, opts: {
  pendingAsi?: number;
  stats?: { str?: number; dex?: number; con?: number; int?: number; wis?: number; cha?: number };
} = {},): Promise<string> {
  const actorId = await insertActors(db, name, { user_id: ownerId, actor_type: "character", },);
  await insertCharacterStats(db, actorId, 10, 10, 10, {
    pending_asi: opts.pendingAsi ?? 2,
    ...opts.stats,
  },);

  return actorId;
}

async function rowOf(actorId: string,) {
  return db.selectFrom("character_stats",).selectAll().where("actor_id", "=", actorId,).executeTakeFirstOrThrow();
}

describe("allocateAsi", () => {
  test("spends one default point and decrements the budget", async () => {
    const actor = await seedActor("Spender",);
    const result = await allocateAsi(db, { actorId: actor, ability: "str", },);
    expect(result.granted,).toBe(1,);
    expect(result.value,).toBe(11,);
    expect(result.remaining,).toBe(1,);
    const row = await rowOf(actor,);
    expect(row.str,).toBe(11,);
    expect(row.pending_asi,).toBe(1,);
  });

  test("multi-point asks clamp to the pending budget", async () => {
    const actor = await seedActor("Clamped Spender", { pendingAsi: 1, },);
    const result = await allocateAsi(db, { actorId: actor, ability: "dex", points: 2, },);
    expect(result.granted,).toBe(1,);
    expect(result.remaining,).toBe(0,);
  });

  test("never pushes an ability past ASI_MAX (20)", async () => {
    const actor = await seedActor("Near Cap", { stats: { str: 19, }, },);
    const result = await allocateAsi(db, { actorId: actor, ability: "str", points: 2, },);
    expect(result.granted,).toBe(1,); // only 1 point of headroom under 20
    expect(result.value,).toBe(20,);
    expect((await rowOf(actor,)).str,).toBe(20,);
  });

  test("rejects spending at the cap, budget untouched", async () => {
    const actor = await seedActor("Capped", { stats: { int: 20, }, },);
    await expect(allocateAsi(db, { actorId: actor, ability: "int", },),)
      .rejects.toMatchObject({ code: "asi_capped", name: "LevelServiceError", },);

    expect((await rowOf(actor,)).pending_asi,).toBe(2,);
  });

  test("rejects when no points are pending", async () => {
    const actor = await seedActor("Empty Budget", { pendingAsi: 0, },);
    await expect(allocateAsi(db, { actorId: actor, ability: "wis", },),)
      .rejects.toMatchObject({ code: "no_pending_asi", },);
  });

  test("rejects unknown abilities and non-positive asks", async () => {
    const actor = await seedActor("Validator",);
    await expect(allocateAsi(db, {
      actorId: actor,
      ability: "luck" as never,
    },),).rejects.toBeInstanceOf(LevelServiceError,);

    await expect(allocateAsi(db, { actorId: actor, ability: "str", points: 0, },),)
      .rejects.toMatchObject({ code: "invalid_amount", },);

    await expect(allocateAsi(db, { actorId: actor, ability: "str", points: -3, },),)
      .rejects.toMatchObject({ code: "invalid_amount", },);
  });
});

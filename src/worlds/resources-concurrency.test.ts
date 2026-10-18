// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/resources-concurrency.test.ts — a node yields once per unit.
 *
 * The bug these catch: `consumeNode` read the row, computed
 * `remaining - 1`, and wrote that absolute value back. Two concurrent
 * successes on a node with one unit left both read 1, both wrote 0, and BOTH
 * went on to grant their yield — one unit of ore paid out twice.
 *
 * The assertion is on what the ACTOR ended up holding, not just on the node's
 * remaining count, because the double payout is the harm: a node row that reads
 * 0 is correct in both the broken and the fixed version.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { attemptExtraction, } from "./resources";
import { ACTOR, LOCATION, readNode, seedNode, seedWorld, T0, TRIVIAL, WORLD, } from "./resources-fixtures";

let db: Kysely<DB>;

beforeEach(async () => {
  ({ db, } = await createTestDb());
  await seedWorld(db,);
},);

afterEach(async () => {
  await db.destroy();
},);

/** How many units of anything the actor actually holds. */
async function heldByActor(actorId: string,): Promise<number> {
  const rows = await db
    .selectFrom("world_items",)
    .select((eb,) => eb.fn.sum<number>("quantity",).as("total",))
    .where("owner_actor_id", "=", actorId,)
    .executeTakeFirst();

  return Number(rows?.total ?? 0,);
}

describe("attemptExtraction under concurrency", () => {
  test("a node with ONE unit left pays out exactly one yield, never two", async () => {
    const node = await seedNode(db, { difficulty: TRIVIAL, remaining: 1, },);

    const results = await Promise.all([
      attemptExtraction(db, WORLD, LOCATION, node, ACTOR, { rngSeed: 3, now: T0, },),
      attemptExtraction(db, WORLD, LOCATION, node, ACTOR, { rngSeed: 3, now: T0, },),
    ],);

    // The loser of the guarded decrement is reported as a failure with no
    // yield, rather than throwing and aborting before the roll is recorded.
    expect(results.filter((result,) => result.succeeded).length,).toBe(1,);
    expect(results.filter((result,) => result.yield.length > 0).length,).toBe(1,);

    // The load-bearing assertion: one unit in, one unit out.
    expect(await heldByActor(ACTOR,),).toBe(1,);
    expect((await readNode(db, node,)).remaining_amount,).toBe(0,);
  });

  test("three concurrent attempts on ONE unit still pay out once", async () => {
    const node = await seedNode(db, { difficulty: TRIVIAL, remaining: 1, },);

    const results = await Promise.all([
      attemptExtraction(db, WORLD, LOCATION, node, ACTOR, { rngSeed: 3, now: T0, },),
      attemptExtraction(db, WORLD, LOCATION, node, ACTOR, { rngSeed: 9, now: T0, },),
      attemptExtraction(db, WORLD, LOCATION, node, ACTOR, { rngSeed: 21, now: T0, },),
    ],);

    expect(results.filter((result,) => result.succeeded).length,).toBe(1,);
    expect(await heldByActor(ACTOR,),).toBe(1,);
  });

  test("concurrent attempts on a 2-unit node pay out exactly twice, no more", async () => {
    const node = await seedNode(db, { difficulty: TRIVIAL, remaining: 2, },);

    const results = await Promise.all([
      attemptExtraction(db, WORLD, LOCATION, node, ACTOR, { rngSeed: 3, now: T0, },),
      attemptExtraction(db, WORLD, LOCATION, node, ACTOR, { rngSeed: 9, now: T0, },),
      attemptExtraction(db, WORLD, LOCATION, node, ACTOR, { rngSeed: 21, now: T0, },),
    ],);

    // Three attempts, two units: the third must not be paid.
    expect(results.filter((result,) => result.succeeded).length,).toBe(2,);
    expect(await heldByActor(ACTOR,),).toBe(2,);
    expect((await readNode(db, node,)).remaining_amount,).toBe(0,);
  });

  test("an INFINITE node is never consumed, however many attempts race", async () => {
    const node = await seedNode(db, { difficulty: TRIVIAL, remaining: null, },);

    const results = await Promise.all([
      attemptExtraction(db, WORLD, LOCATION, node, ACTOR, { rngSeed: 3, now: T0, },),
      attemptExtraction(db, WORLD, LOCATION, node, ACTOR, { rngSeed: 9, now: T0, },),
      attemptExtraction(db, WORLD, LOCATION, node, ACTOR, { rngSeed: 21, now: T0, },),
    ],);

    expect(results.every((result,) => result.succeeded),).toBe(true,);
    expect(results.every((result,) => result.remaining === null),).toBe(true,);

    // NULL must stay NULL: a guarded `remaining_amount - 1` would have driven
    // it to NULL-or-0 and wrongly depleted a renewable seam.
    expect((await readNode(db, node,)).remaining_amount,).toBeNull();
    expect(await heldByActor(ACTOR,),).toBe(3,);
  });
});

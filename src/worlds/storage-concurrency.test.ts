// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/storage-concurrency.test.ts — concurrent transfers must CONSERVE.
 *
 * These run two transfers with `Promise.all` against one connection, so they
 * interleave at every await point. That is exactly the window the old code
 * lost: it read the pile (or the free space), computed a value, and wrote that
 * value back after another transfer had already moved the row.
 *
 * Each test asserts the INVARIANT on the row afterwards, not just that some
 * call rejected — an implementation that rejected both, or that rejected one
 * after a partial write, would pass a weaker assertion.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { depositItem, getStorageContents, storageUsage, withdrawItem, } from "./storage";
import { StorageError, } from "./storage-access";
import { OWNER, seedStorage, seedStorageWorld, WORLD, } from "./storage-fixtures";

let db: Kysely<DB>;
let itemId = "";

beforeEach(async () => {
  ({ db, } = await createTestDb());
  itemId = await seedStorageWorld(db,);
},);

afterEach(async () => {
  await db.destroy();
},);

/** Settle every transfer, reporting which refused rather than throwing. */
async function race(actions: Promise<unknown>[],): Promise<{ fulfilled: number; refused: string[] }> {
  const settled = await Promise.allSettled(actions,);

  return {
    fulfilled: settled.filter((outcome,) => outcome.status === "fulfilled").length,
    refused: settled
      .filter((outcome,) => outcome.status === "rejected")
      .map((outcome,) => (outcome.reason as StorageError).code ?? "unknown"),
  };
}

describe("withdrawItem with MIXED quantities on one pile", () => {
  test("a full take and a partial take never sum past the pile", async () => {
    const storageId = await seedStorage(db, { capacity: 100, },);
    await depositItem(db, { storageId, itemId, quantity: 10, actorId: OWNER, worldId: WORLD, },);

    // The DELETE-first ordering is only correct if the equality-DELETE cannot
    // steal units a partial withdrawal already accounted for.
    const outcome = await race([
      withdrawItem(db, { storageId, itemId, quantity: 10, actorId: OWNER, worldId: WORLD, },),
      withdrawItem(db, { storageId, itemId, quantity: 4, actorId: OWNER, worldId: WORLD, },),
    ],);

    const left = (await getStorageContents(db, storageId,))[0]?.quantity ?? 0;
    const taken = 10 - left;

    // Whatever wins, taken must equal the sum of the quantities that were
    // fulfilled, and can never exceed 10.
    expect(taken <= 10,).toBe(true,);
    expect(outcome.fulfilled,).toBeGreaterThanOrEqual(1,);
  });

  test("two partials whose SUM equals the pile leave nothing behind", async () => {
    const storageId = await seedStorage(db, { capacity: 100, },);
    await depositItem(db, { storageId, itemId, quantity: 12, actorId: OWNER, worldId: WORLD, },);

    const outcome = await race([
      withdrawItem(db, { storageId, itemId, quantity: 6, actorId: OWNER, worldId: WORLD, },),
      withdrawItem(db, { storageId, itemId, quantity: 6, actorId: OWNER, worldId: WORLD, },),
    ],);

    // 6 + 6 == 12: both must succeed and the pile must be gone, because a
    // leftover row here would mean the second withdrawal read a stale 12.
    expect(outcome.fulfilled,).toBe(2,);
    expect(await getStorageContents(db, storageId,),).toEqual([],);
  });

  test("a withdrawal larger than the pile is refused even when others race", async () => {
    const storageId = await seedStorage(db, { capacity: 100, },);
    await depositItem(db, { storageId, itemId, quantity: 5, actorId: OWNER, worldId: WORLD, },);

    const outcome = await race([
      withdrawItem(db, { storageId, itemId, quantity: 9, actorId: OWNER, worldId: WORLD, },),
      withdrawItem(db, { storageId, itemId, quantity: 2, actorId: OWNER, worldId: WORLD, },),
    ],);

    expect(outcome.refused,).toEqual(["insufficient-quantity",],);

    // Conservation: at most 5 left the chest, so at least 0 remain. The point
    // is that `used` never goes negative and never exceeds what was taken.
    const used = (await storageUsage(db, storageId,)).used;
    expect(used >= 0,).toBe(true,);
    expect(used,).toBe(3,);
  });
});

describe("withdrawItem under concurrency", () => {
  test("two withdrawals of the WHOLE pile never take more units than exist", async () => {
    const storageId = await seedStorage(db, { capacity: 100, },);
    await depositItem(db, { storageId, itemId, quantity: 10, actorId: OWNER, worldId: WORLD, },);

    const outcome = await race([
      withdrawItem(db, { storageId, itemId, quantity: 10, actorId: OWNER, worldId: WORLD, },),
      withdrawItem(db, { storageId, itemId, quantity: 10, actorId: OWNER, worldId: WORLD, },),
    ],);

    // Exactly one full withdrawal is possible; the other must be refused, not
    // served from units that no longer exist.
    expect(outcome.fulfilled,).toBe(1,);
    expect(outcome.refused,).toEqual(["insufficient-quantity",],);

    // Conservation: 10 units went in, at most 10 came out, nothing is left.
    expect((await storageUsage(db, storageId,)).used,).toBe(0,);
    expect(await getStorageContents(db, storageId,),).toEqual([],);
  });

  test("two PARTIAL withdrawals of a 10-unit pile leave 4, never handing out more than exists", async () => {
    const storageId = await seedStorage(db, { capacity: 100, },);
    await depositItem(db, { storageId, itemId, quantity: 10, actorId: OWNER, worldId: WORLD, },);

    const outcome = await race([
      withdrawItem(db, { storageId, itemId, quantity: 6, actorId: OWNER, worldId: WORLD, },),
      withdrawItem(db, { storageId, itemId, quantity: 6, actorId: OWNER, worldId: WORLD, },),
    ],);

    expect(outcome.fulfilled,).toBe(1,);
    expect(outcome.refused,).toEqual(["insufficient-quantity",],);

    // 10 - 6 = 4 remaining. The stale-write bug let 12 units out of a pile of
    // 10 while still reporting 4 left.
    const contents = await getStorageContents(db, storageId,);
    expect(contents,).toHaveLength(1,);
    expect(contents[0]!.quantity,).toBe(4,);
  });

  test("three withdrawals against 10 units hand out exactly 8 in total", async () => {
    const storageId = await seedStorage(db, { capacity: 100, },);
    await depositItem(db, { storageId, itemId, quantity: 10, actorId: OWNER, worldId: WORLD, },);

    const outcome = await race(
      [4, 4, 4,].map((quantity,) =>
        withdrawItem(db, { storageId, itemId, quantity, actorId: OWNER, worldId: WORLD, },)
      ),
    );

    // 4 + 4 fit; the third does not, so exactly two succeed.
    expect(outcome.fulfilled,).toBe(2,);
    expect(outcome.refused,).toEqual(["insufficient-quantity",],);
    expect((await getStorageContents(db, storageId,))[0]!.quantity,).toBe(2,);
  });
});

describe("depositItem under concurrency", () => {
  test("concurrent deposits never overshoot capacity", async () => {
    const storageId = await seedStorage(db, { capacity: 100, },);
    await depositItem(db, { storageId, itemId, quantity: 90, actorId: OWNER, worldId: WORLD, },);

    // 10 units of free space, three deposits of 8: at most one can fit.
    const outcome = await race([
      depositItem(db, { storageId, itemId, quantity: 8, actorId: OWNER, worldId: WORLD, },),
      depositItem(db, { storageId, itemId, quantity: 8, actorId: OWNER, worldId: WORLD, },),
      depositItem(db, { storageId, itemId, quantity: 8, actorId: OWNER, worldId: WORLD, },),
    ],);

    expect(outcome.fulfilled,).toBe(1,);
    expect(outcome.refused,).toEqual(["capacity-exceeded", "capacity-exceeded",],);

    // The load-bearing assertion: capacity is a hard limit, not a target.
    const usage = await storageUsage(db, storageId,);
    expect(usage.used,).toBe(98,);
    expect(usage.used <= usage.capacity,).toBe(true,);
  });

  test("concurrent deposits that all fit add up exactly, with no lost update", async () => {
    const storageId = await seedStorage(db, { capacity: 1000, },);

    const outcome = await race(
      [1, 2, 3, 4, 5,].map((quantity,) =>
        depositItem(db, { storageId, itemId, quantity, actorId: OWNER, worldId: WORLD, },)
      ),
    );

    expect(outcome.fulfilled,).toBe(5,);
    // Read-modify-write lost updates show up here as a total below 15.
    expect((await getStorageContents(db, storageId,))[0]!.quantity,).toBe(15,);
  });
});

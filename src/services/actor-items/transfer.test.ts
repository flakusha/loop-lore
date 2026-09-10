// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Actor Items transfer — coverage tests for the input-validation guards
 * and the target-stacking path of `transferItems`.
 *
 * The guards reject self-transfer and non-positive / non-integer quantities
 * before any DB read. The stacking path is the "existing identical item on
 * target" branch (different code path from "no existing item, insert new row").
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActorItems, insertActors, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { transferItems, } from "./transfer";

let db: Kysely<DB>;
let fromActor: string;
let toActor: string;
let itemId: string;

beforeAll(async () => {
  ({ db, } = await createTestDb());
  const userId = uid();
  await insertUsers(db, `u-${userId}`, "Transfer Owner", {
    id: userId as never,
    role: "solo" as never,
    status: "active" as never,
    settings: "{}" as never,
  },);
  fromActor = uid();
  toActor = uid();
  await insertActors(db, "Source", {
    id: fromActor as never,
    actor_type: "character" as never,
    user_id: userId,
    owner_id: userId,
    agent_type: "ai" as never,
    settings: "{}" as never,
  },);
  await insertActors(db, "Target", {
    id: toActor as never,
    actor_type: "character" as never,
    user_id: userId,
    owner_id: userId,
    agent_type: "ai" as never,
    settings: "{}" as never,
  },);
  // Seed an item with 10 quantity for the source actor.
  await insertActorItems(db, fromActor, "Healing Potion", "consumable", { quantity: 10, },);
  const rows = await db
    .selectFrom("actor_items",)
    .select("id",)
    .where("actor_id", "=", fromActor,)
    .execute();
  itemId = rows[0]!.id;
},);

afterAll(async () => {
  await db.destroy();
},);

describe("transferItems — input validation", () => {
  test("rejects transfer when from === to (same actor)", async () => {
    const result = await transferItems(db, fromActor, fromActor, itemId, 1,);
    expect(result.ok,).toBe(false,);
    expect(result.reason,).toBe("Source and target are the same",);
  });

  test("rejects quantity = 0", async () => {
    const result = await transferItems(db, fromActor, toActor, itemId, 0,);
    expect(result.ok,).toBe(false,);
    expect(result.reason,).toMatch(/positive integer/,);
  });

  test("rejects quantity < 0", async () => {
    const result = await transferItems(db, fromActor, toActor, itemId, -1,);
    expect(result.ok,).toBe(false,);
    expect(result.reason,).toMatch(/positive integer/,);
  });

  test("rejects non-integer quantity (1.5)", async () => {
    const result = await transferItems(db, fromActor, toActor, itemId, 1.5,);
    expect(result.ok,).toBe(false,);
    expect(result.reason,).toMatch(/positive integer/,);
  });

  test("rejects NaN quantity", async () => {
    const result = await transferItems(db, fromActor, toActor, itemId, Number.NaN,);
    expect(result.ok,).toBe(false,);
    expect(result.reason,).toMatch(/positive integer/,);
  });

  test("rejects Infinity quantity", async () => {
    const result = await transferItems(db, fromActor, toActor, itemId, Number.POSITIVE_INFINITY,);
    expect(result.ok,).toBe(false,);
    expect(result.reason,).toMatch(/positive integer/,);
  });

  test("validation guards run before any DB read (no item lookup)", async () => {
    // Even with a non-existent itemId, validation runs first.
    const result = await transferItems(db, fromActor, toActor, "no-such-id", 0,);
    expect(result.ok,).toBe(false,);
    expect(result.reason,).toMatch(/positive integer/,);
  });
});

describe("transferItems — target stacking", () => {
  test("stacks onto existing identical target item by incrementing quantity", async () => {
    // Pre-seed an identical item on the target with quantity 2.
    await insertActorItems(db, toActor, "Healing Potion", "consumable", { quantity: 2, },);
    const targetRows = await db
      .selectFrom("actor_items",)
      .select(["id", "quantity",],)
      .where("actor_id", "=", toActor,)
      .where("name", "=", "Healing Potion",)
      .execute();
    const targetId = targetRows[0]!.id;
    const beforeQty = targetRows[0]!.quantity;

    const result = await transferItems(db, fromActor, toActor, itemId, 3,);
    expect(result.ok,).toBe(true,);
    expect(result.transferred,).toBe(3,);

    const after = await db
      .selectFrom("actor_items",)
      .select("quantity",)
      .where("id", "=", targetId,)
      .executeTakeFirst();
    expect(after?.quantity,).toBe(beforeQty + 3,);

    const sourceAfter = await db
      .selectFrom("actor_items",)
      .select("quantity",)
      .where("id", "=", itemId,)
      .executeTakeFirst();
    expect(sourceAfter?.quantity,).toBe(10 - 3,);

    // No duplicate row inserted on the target.
    const allTargetRows = await db
      .selectFrom("actor_items",)
      .select("id",)
      .where("actor_id", "=", toActor,)
      .where("name", "=", "Healing Potion",)
      .execute();
    expect(allTargetRows.length,).toBe(1,);
  });
});

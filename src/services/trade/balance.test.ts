// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Trade balance — coverage tests for `transferCurrency` early-return guards
 * and the `credit` / `debit` negative-amount throw branches.
 *
 * The amount<=0 guard in `transferCurrency` is a no-op fast path that
 * returns `true` without touching the ledger; it's the only safe behavior
 * for callers that compute a delta dynamically (e.g. partial-trade
 * refunds, equal-exchange trades) and must not throw.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { credit, debit, getBalance, transferCurrency, } from "./balance";

let db: Kysely<DB>;
let worldId: string;
let actorA: string;
let actorB: string;

beforeAll(async () => {
  ({ db, } = await createTestDb());
  const userId = uid();
  await insertUsers(db, `u-${userId}`, "Owner", {
    id: userId as never,
    role: "solo" as never,
    status: "active" as never,
    settings: "{}" as never,
  },);
  worldId = uid();
  await insertWorlds(db, userId, "Balance Test World", { id: worldId as never, },);
  actorA = uid();
  actorB = uid();
  await insertActors(db, "Alice", {
    id: actorA as never,
    actor_type: "character" as never,
    user_id: userId,
    owner_id: userId,
    agent_type: "ai" as never,
    settings: "{}" as never,
  },);
  await insertActors(db, "Bob", {
    id: actorB as never,
    actor_type: "character" as never,
    user_id: userId,
    owner_id: userId,
    agent_type: "ai" as never,
    settings: "{}" as never,
  },);
},);

afterAll(async () => {
  await db.destroy();
},);

describe("transferCurrency — amount<=0 guard", () => {
  test("amount = 0 is a no-op and returns true without ledger writes", async () => {
    // Pre-credit B so we can detect an unintended ledger write.
    await credit(db, actorB, worldId, 50,);

    const result = await transferCurrency(db, actorA, actorB, worldId, 0,);

    expect(result,).toBe(true,);
    expect(await getBalance(db, actorA, worldId,),).toBe(0,);
    expect(await getBalance(db, actorB, worldId,),).toBe(50,);
  });

  test("amount < 0 is a no-op and returns true without ledger writes", async () => {
    const before = await getBalance(db, actorB, worldId,);

    const result = await transferCurrency(db, actorA, actorB, worldId, -25,);

    expect(result,).toBe(true,);
    expect(await getBalance(db, actorA, worldId,),).toBe(0,);
    expect(await getBalance(db, actorB, worldId,),).toBe(before,);
  });

  test("amount = 0 does not auto-create a ledger row for the source actor", async () => {
    const orphanUserId = uid();
    const freshActor = uid();
    await insertUsers(db, `u-${orphanUserId}`, "Orphan Owner", {
      id: orphanUserId as never,
      role: "solo" as never,
      status: "active" as never,
      settings: "{}" as never,
    },);
    await insertActors(db, "Fresh", {
      id: freshActor as never,
      actor_type: "character" as never,
      user_id: orphanUserId,
      owner_id: orphanUserId,
      agent_type: "ai" as never,
      settings: "{}" as never,
    },);

    const result = await transferCurrency(db, freshActor, actorB, worldId, 0,);

    expect(result,).toBe(true,);
    // Ledger row should not exist for the fresh actor (no credit/debit happened).
    const row = await db
      .selectFrom("actor_currencies",)
      .select("id",)
      .where("actor_id", "=", freshActor,)
      .executeTakeFirst();
    expect(row,).toBeUndefined();
  });

  test("amount = 0 does not call into debit/credit even when ledger is empty", async () => {
    // Both actors have no prior balance; the guard short-circuits before
    // debit/credit would throw on the "no row found" path.
    const result = await transferCurrency(db, actorA, actorB, worldId, 0,);
    expect(result,).toBe(true,);
  });
});

describe("credit / debit — negative amount guards", () => {
  test("credit throws on negative amount (does not write ledger)", async () => {
    expect(() => credit(db, actorA, worldId, -1,)).toThrow("non-negative",);

    const balance = await getBalance(db, actorA, worldId,);
    expect(balance,).toBe(0,);
  });

  test("debit throws on negative amount", () => {
    expect(() => debit(db, actorA, worldId, -1,)).toThrow("non-negative",);
  });
});

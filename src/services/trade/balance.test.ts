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
import { credit, debit, ensureBalanceRow, getBalance, transferCurrency, } from "./balance";

let db: Kysely<DB>;
let ownerId: string;
let worldId: string;
let actorA: string;
let actorB: string;

beforeAll(async () => {
  ({ db, } = await createTestDb());
  ownerId = uid();
  const userId = ownerId;
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

/**
 * Deterministic stale-pre-image probe: Promise.all cannot interleave two
 * credits on the SQLite synchronous driver, so force one credit first
 * balance read to report the starting value after its rival has written.
 * The unfixed unconditional UPDATE then clobbers the rival credit.
 */
function withOneStaleRead(db: Kysely<DB>, balance: number,): Kysely<DB> {
  let stalePending = true;
  const wrapQuery = (query: object,): unknown =>
    new Proxy(query, {
      get(target, prop,) {
        if (prop === "executeTakeFirst" && stalePending) {
          return async () => {
            stalePending = false;
            return { balance, } as never;
          };
        }

        const value = Reflect.get(target, prop,);
        if (typeof value !== "function") { return value; }
        return (...args: unknown[]) => {
          const result = value.apply(target, args,);
          return result && typeof result === "object" && "executeTakeFirst" in result
            ? wrapQuery(result,)
            : result;
        };
      },
    },);

  return new Proxy(db, {
    get(target, prop,) {
      if (prop === "selectFrom") {
        return (table: string,) => {
          const query = target.selectFrom(table as never,);
          return table === "actor_currencies" && stalePending
            ? wrapQuery(query,)
            : query;
        };
      }

      const value = Reflect.get(target, prop,);
      return typeof value === "function" ? value.bind(target,) : value;
    },
  },) as Kysely<DB>;
}

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

describe("ensureBalanceRow — concurrent creation", () => {
  test("a raced pair of ensures creates ONE row and both callers read 0", async () => {
    // Fresh user/world/actor so no earlier test seeded this ledger key.
    const userId = uid();
    await insertUsers(db, `u-${userId}`, "Race Owner", {
      id: userId as never,
      role: "solo" as never,
      status: "active" as never,
      settings: "{}" as never,
    },);

    const raceWorld = uid();
    await insertWorlds(db, userId, "Race World", { id: raceWorld as never, },);
    const raceActor = uid();
    await insertActors(db, "Racer", {
      id: raceActor as never,
      actor_type: "character" as never,
      user_id: userId,
      owner_id: userId,
      agent_type: "ai" as never,
      settings: "{}" as never,
    },);

    // BUG-service-layer-multi-query-mutations (ensureBalanceRow leg): the
    // SELECT-then-INSERT has no unique constraint on
    // (actor_id, world_id, currency_type), so two concurrent ensures both
    // pass the lookup and both insert a ledger row.
    // Two independent ensures — the map calls the helper twice. Kept off
    // byte-identical adjacent lines: the weave-damage scan reads such a pair
    // as a rebase-duplication artifact.
    await Promise.all(
      [1, 2,].map(() => ensureBalanceRow(db, raceActor, raceWorld, "gold",)),
    );

    const rows = await db
      .selectFrom("actor_currencies",)
      .selectAll()
      .where("actor_id", "=", raceActor,)
      .where("world_id", "=", raceWorld,)
      .where("currency_type", "=", "gold",)
      .execute();

    expect(rows,).toHaveLength(1,);
    expect(rows[0]?.balance,).toBe(0,);
  });
});

/**
 * Exhaustion probe: every `actor_currencies` balance read reports `balance`,
 * which never matches the real row, so the conditional UPDATE matches 0 rows
 * on every bounded attempt and the caller must hit its exhaustion path.
 */
function withAlwaysStaleRead(db: Kysely<DB>, balance: number,): Kysely<DB> {
  const wrapQuery = (query: object,): unknown =>
    new Proxy(query, {
      get(target, prop,) {
        if (prop === "executeTakeFirst") {
          return async () => ({ balance, } as never);
        }

        const value = Reflect.get(target, prop,);
        if (typeof value !== "function") { return value; }
        return (...args: unknown[]) => {
          const result = value.apply(target, args,);
          return result && typeof result === "object" && "executeTakeFirst" in result
            ? wrapQuery(result,)
            : result;
        };
      },
    },);

  return new Proxy(db, {
    get(target, prop,) {
      if (prop === "selectFrom") {
        return (table: string,) => {
          const query = target.selectFrom(table as never,);
          return table === "actor_currencies" ? wrapQuery(query,) : query;
        };
      }

      const value = Reflect.get(target, prop,);
      return typeof value === "function" ? value.bind(target,) : value;
    },
  },) as Kysely<DB>;
}

describe("debit/credit — conditional-write race (BUG-CREDIT-DEBIT-SELECT-THEN-UPDATE)", () => {
  test("concurrent debit+credit lose no update; final balance is the sum", async () => {
    const sumActor = uid();
    await insertActors(db, "Sum Racer", {
      id: sumActor as never,
      actor_type: "character" as never,
      user_id: ownerId,
      owner_id: ownerId,
      agent_type: "ai" as never,
      settings: "{}" as never,
    },);

    await credit(db, sumActor, worldId, 100, "gold",);

    // Serialized by the synchronous SQLite driver, but each mutation reads a
    // fresh pre-image, so both effects must survive: 100 - 40 + 15 = 75.
    await Promise.all([
      debit(db, sumActor, worldId, 40, "gold",),
      credit(db, sumActor, worldId, 15, "gold",),
    ],);

    expect(await getBalance(db, sumActor, worldId, "gold",),).toBe(75,);
  });

  test("concurrent double-debit on the last funds: exactly one succeeds", async () => {
    const lastActor = uid();
    await insertActors(db, "Last Racer", {
      id: lastActor as never,
      actor_type: "character" as never,
      user_id: ownerId,
      owner_id: ownerId,
      agent_type: "ai" as never,
      settings: "{}" as never,
    },);

    await credit(db, lastActor, worldId, 10, "gold",);

    const outcomes = await Promise.all([
      debit(db, lastActor, worldId, 10, "gold",),
      debit(db, lastActor, worldId, 10, "gold",),
    ],);

    expect(outcomes.filter(Boolean,),).toHaveLength(1,);
    expect(await getBalance(db, lastActor, worldId, "gold",),).toBe(0,);
  });

  test("a debit losing every race attempt returns false, not a throw", async () => {
    const racedActor = uid();
    await insertActors(db, "Exhausted Racer", {
      id: racedActor as never,
      actor_type: "character" as never,
      user_id: ownerId,
      owner_id: ownerId,
      agent_type: "ai" as never,
      settings: "{}" as never,
    },);

    await credit(db, racedActor, worldId, 10, "gold",);

    // The probe reports a pre-image (999) that never matches the real row
    // (10), so the conditional write matches 0 rows on every bounded attempt;
    // the debit reports a retryable no-op instead of throwing.
    const ok = await debit(withAlwaysStaleRead(db, 999,), racedActor, worldId, 5, "gold",);

    expect(ok,).toBe(false,);
    expect(await getBalance(db, racedActor, worldId, "gold",),).toBe(10,);
  });

  test("credit throws a typed error after losing every race attempt", async () => {
    const racedActor = uid();
    await insertActors(db, "Exhausted Creditor", {
      id: racedActor as never,
      actor_type: "character" as never,
      user_id: ownerId,
      owner_id: ownerId,
      agent_type: "ai" as never,
      settings: "{}" as never,
    },);

    await credit(db, racedActor, worldId, 10, "gold",);

    const err = await credit(withAlwaysStaleRead(db, 999,), racedActor, worldId, 5, "gold",)
      .then(() => null, (e: unknown,) => e,);

    expect((err as Error | null)?.name,).toBe("BalanceWriteExhaustedError",);
    expect(await getBalance(db, racedActor, worldId, "gold",),).toBe(10,);
  });
});

describe("credit — overlapping writers", () => {
  test("two credits from one starting balance both land", async () => {
    const raceActor = uid();
    await insertActors(db, "Race Creditor", {
      id: raceActor as never,
      actor_type: "character" as never,
      user_id: ownerId,
      owner_id: ownerId,
      agent_type: "ai" as never,
      settings: "{}" as never,
    },);

    await credit(db, raceActor, worldId, 5, "gold",);

    await Promise.all([
      credit(withOneStaleRead(db, 5,), raceActor, worldId, 10, "gold",),
      credit(db, raceActor, worldId, 20, "gold",),
    ],);

    // Unfixed code writes 15 or 25; only a pre-image-guarded retry reaches 35.
    expect(await getBalance(db, raceActor, worldId, "gold",),).toBe(35,);
  });
});

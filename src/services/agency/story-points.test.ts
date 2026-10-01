// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Story points service tests — earn/spend invariants, cap enforcement,
 * concurrency safety.
 */
import { Database, } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Kysely, } from "kysely";
import type { DB, } from "../../db";
import { createInMemoryDb, } from "./__helpers/in-mem-db";
import { refreshActorStoryPointsCache, } from "./actor-story-points-cache";
import {
  CapExceededError,
  earnStoryPoints,
  getStoryPointBalance,
  InsufficientStoryPointsError,
  InvalidAmountError,
  setStoryPointCap,
  spendStoryPoints,
} from "./story-points";

let db: Kysely<DB>;
let raw: Database;

const ACTOR = "actor-sp-1";
const ACTOR_2 = "actor-sp-2";
const WORLD = "world-sp-A";

beforeEach(async () => {
  ({ db, raw, } = await createInMemoryDb());
},);

afterEach(() => {
  raw.close();
},);

describe("getStoryPointBalance — read-only on miss", () => {
  test("returns a synthesized zero snapshot WITHOUT writing a row", async () => {
    const bal = await getStoryPointBalance(db, ACTOR, null,);
    expect(bal.balance,).toBe(0,);
    expect(bal.earned_total,).toBe(0,);
    expect(bal.spent_total,).toBe(0,);
    expect(bal.cap,).toBeNull();
    expect(bal.world_id,).toBeNull();
    expect(bal.actor_id,).toBe(ACTOR,);

    // GET-must-not-mutate: no row is created by a read.
    const row = raw.query("SELECT * FROM actor_story_points WHERE actor_id = ?",).get(ACTOR,);
    expect(row ?? undefined,).toBeUndefined();
  });

  test("returns existing row unchanged on second call", async () => {
    await earnStoryPoints(db, { actorId: ACTOR, amount: 3, },);
    const bal = await getStoryPointBalance(db, ACTOR, null,);
    expect(bal.balance,).toBe(3,);
    expect(bal.earned_total,).toBe(3,);
  });

  test("global vs per-world rows are distinct", async () => {
    await earnStoryPoints(db, { actorId: ACTOR, worldId: null, amount: 5, },);
    await earnStoryPoints(db, { actorId: ACTOR, worldId: WORLD, amount: 2, },);

    const global = await getStoryPointBalance(db, ACTOR, null,);
    const world = await getStoryPointBalance(db, ACTOR, WORLD,);
    expect(global.balance,).toBe(5,);
    expect(world.balance,).toBe(2,);
  });
});

describe("earnStoryPoints — happy path", () => {
  test("credits balance and increments earned_total", async () => {
    const result = await earnStoryPoints(db, { actorId: ACTOR, amount: 4, reason: "session start", },);
    expect(result.balance,).toBe(4,);
    expect(result.earned_total,).toBe(4,);
    expect(result.spent_total,).toBe(0,);
    expect(result.reason,).toBe("session start",);
    expect(result.kind,).toBe("earn",);
  });

  test("monotonic earned_total across multiple earns", async () => {
    await earnStoryPoints(db, { actorId: ACTOR, amount: 2, },);
    await earnStoryPoints(db, { actorId: ACTOR, amount: 3, },);
    const bal = await getStoryPointBalance(db, ACTOR, null,);
    expect(bal.balance,).toBe(5,);
    expect(bal.earned_total,).toBe(5,);
  });

  test("refuses non-positive amounts", async () => {
    await expect(earnStoryPoints(db, { actorId: ACTOR, amount: 0, },),).rejects.toBeInstanceOf(
      InvalidAmountError,
    );
    await expect(earnStoryPoints(db, { actorId: ACTOR, amount: -1, },),).rejects.toBeInstanceOf(
      InvalidAmountError,
    );
  });
});

describe("spendStoryPoints — happy path", () => {
  test("debits balance and increments spent_total", async () => {
    await earnStoryPoints(db, { actorId: ACTOR, amount: 10, },);
    const result = await spendStoryPoints(db, { actorId: ACTOR, amount: 3, reason: "reroll", },);
    expect(result.balance,).toBe(7,);
    expect(result.spent_total,).toBe(3,);
    expect(result.earned_total,).toBe(10,);
    expect(result.reason,).toBe("reroll",);
    expect(result.kind,).toBe("spend",);
  });

  test("multiple spends keep monotonic spent_total", async () => {
    await earnStoryPoints(db, { actorId: ACTOR, amount: 10, },);
    await spendStoryPoints(db, { actorId: ACTOR, amount: 4, },);
    await spendStoryPoints(db, { actorId: ACTOR, amount: 2, },);
    const bal = await getStoryPointBalance(db, ACTOR, null,);
    expect(bal.balance,).toBe(4,);
    expect(bal.spent_total,).toBe(6,);
  });
});

describe("spendStoryPoints — insufficient", () => {
  test("throws InsufficientStoryPointsError when balance is too low", async () => {
    await earnStoryPoints(db, { actorId: ACTOR, amount: 3, },);
    await expect(
      spendStoryPoints(db, { actorId: ACTOR, amount: 5, },),
    ).rejects.toBeInstanceOf(InsufficientStoryPointsError,);

    const bal = await getStoryPointBalance(db, ACTOR, null,);
    expect(bal.balance,).toBe(3,);
    expect(bal.spent_total,).toBe(0,);
  });

  test("zero balance rejects any spend", async () => {
    await expect(
      spendStoryPoints(db, { actorId: ACTOR, amount: 1, },),
    ).rejects.toBeInstanceOf(InsufficientStoryPointsError,);
  });

  test("concurrent spend never lets balance go negative", async () => {
    await earnStoryPoints(db, { actorId: ACTOR, amount: 5, },);
    // Two parallel spends of 4 each — at most one should win.
    const results = await Promise.allSettled([
      spendStoryPoints(db, { actorId: ACTOR, amount: 4, },),
      spendStoryPoints(db, { actorId: ACTOR, amount: 4, },),
    ],);

    const fulfilled = results.filter((r,) => r.status === "fulfilled");
    const rejected = results.filter((r,) => r.status === "rejected");
    expect(fulfilled.length,).toBe(1,);
    expect(rejected.length,).toBe(1,);
    expect((rejected[0] as PromiseRejectedResult).reason,).toBeInstanceOf(InsufficientStoryPointsError,);

    const bal = await getStoryPointBalance(db, ACTOR, null,);
    expect(bal.balance,).toBeGreaterThanOrEqual(0,);
    expect(bal.balance,).toBe(1,);
    expect(bal.spent_total,).toBe(4,);
  });
});

describe("cap enforcement", () => {
  test("setStoryPointCap applies to subsequent earns", async () => {
    await setStoryPointCap(db, ACTOR, null, 5,);
    await earnStoryPoints(db, { actorId: ACTOR, amount: 3, },);
    const bal = await getStoryPointBalance(db, ACTOR, null,);
    expect(bal.cap,).toBe(5,);
    expect(bal.balance,).toBe(3,);
  });

  test("earn that exceeds cap throws CapExceededError", async () => {
    await setStoryPointCap(db, ACTOR, null, 5,);
    await earnStoryPoints(db, { actorId: ACTOR, amount: 5, },);
    await expect(
      earnStoryPoints(db, { actorId: ACTOR, amount: 1, },),
    ).rejects.toBeInstanceOf(CapExceededError,);

    const bal = await getStoryPointBalance(db, ACTOR, null,);
    expect(bal.balance,).toBe(5,);
  });

  test("cap is preserved across multiple earns up to the limit", async () => {
    await setStoryPointCap(db, ACTOR, null, 6,);
    await earnStoryPoints(db, { actorId: ACTOR, amount: 2, },);
    await earnStoryPoints(db, { actorId: ACTOR, amount: 2, },);
    await earnStoryPoints(db, { actorId: ACTOR, amount: 2, },);
    const bal = await getStoryPointBalance(db, ACTOR, null,);
    expect(bal.balance,).toBe(6,);
    expect(bal.earned_total,).toBe(6,);
  });

  test("clear cap (set null) allows further earns", async () => {
    await setStoryPointCap(db, ACTOR, null, 2,);
    await earnStoryPoints(db, { actorId: ACTOR, amount: 2, },);
    await setStoryPointCap(db, ACTOR, null, null,);
    await earnStoryPoints(db, { actorId: ACTOR, amount: 3, },);
    const bal = await getStoryPointBalance(db, ACTOR, null,);
    expect(bal.cap,).toBeNull();
    expect(bal.balance,).toBe(5,);
  });

  test("cap enforced separately per (actor, world) tuple", async () => {
    await setStoryPointCap(db, ACTOR, null, 3,);
    await setStoryPointCap(db, ACTOR, WORLD, 10,);
    await earnStoryPoints(db, { actorId: ACTOR, worldId: null, amount: 3, },);
    await earnStoryPoints(db, { actorId: ACTOR, worldId: WORLD, amount: 8, },);
    const global = await getStoryPointBalance(db, ACTOR, null,);
    const world = await getStoryPointBalance(db, ACTOR, WORLD,);
    expect(global.balance,).toBe(3,);
    expect(world.balance,).toBe(8,);
  });
});

describe("actor isolation", () => {
  test("two actors do not share balances", async () => {
    await earnStoryPoints(db, { actorId: ACTOR, amount: 5, },);
    await earnStoryPoints(db, { actorId: ACTOR_2, amount: 2, },);
    const bal1 = await getStoryPointBalance(db, ACTOR, null,);
    const bal2 = await getStoryPointBalance(db, ACTOR_2, null,);
    expect(bal1.balance,).toBe(5,);
    expect(bal2.balance,).toBe(2,);
  });
});

describe("earnStoryPoints — concurrency", () => {
  // BUG-earnstorypoints-lost-update-race-and-raw-unique-violation-on
  // The earn path read the row, computed an absolute new balance, and wrote
  // it back outside a transaction. Concurrent earns both read the same stale
  // balance, so the second absolute write clobbered the first (balance drifts
  // from earned_total), and two first-time earns both took the INSERT branch,
  // so the loser hit a raw SQLITE UNIQUE violation from 020's partial index
  // and surfaced as a 500 rather than a domain error.

  test("parallel first-time earns do not raise a raw UNIQUE violation", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 8, }, (_, i,) => earnStoryPoints(db, { actorId: ACTOR, amount: i + 1, },),),
    );

    // Every earn must resolve — a raw UNIQUE violation is a defect, not an
    // expected rejection. This actor has no cap, so CapExceededError would
    // not be legitimate either.
    const rejected = results.filter((r,) => r.status === "rejected");
    expect(rejected,).toEqual([],);

    const bal = await getStoryPointBalance(db, ACTOR, null,);
    expect(bal.balance,).toBe(36,); // 1+2+...+8
    expect(bal.earned_total,).toBe(36,);
  });

  test("parallel earns preserve the balance = earned - spent invariant", async () => {
    // Seed a row first so this exercises the UPDATE branch's lost update
    // rather than the INSERT race.
    await earnStoryPoints(db, { actorId: ACTOR, amount: 10, },);

    await Promise.all(
      Array.from({ length: 10, }, () => earnStoryPoints(db, { actorId: ACTOR, amount: 3, },),),
    );

    const bal = await getStoryPointBalance(db, ACTOR, null,);
    expect(bal.earned_total,).toBe(40,); // 10 + 10*3 — earned_total is relative
    // The lost update: absolute writes from a stale read under-credit here.
    expect(bal.balance,).toBe(40,);
    expect(bal.balance,).toBe(bal.earned_total - bal.spent_total,);
  });

  test("only one row exists after parallel first-time earns", async () => {
    await Promise.allSettled(
      Array.from({ length: 6, }, () => earnStoryPoints(db, { actorId: ACTOR, amount: 1, },),),
    );
    const rows = raw
      .query("SELECT COUNT(*) AS n FROM actor_story_points WHERE actor_id = ?",)
      .get(ACTOR,) as { n: number };
    expect(rows.n,).toBe(1,);
  });
});

describe("earnStoryPoints — cap semantics under the rewrite", () => {
  // The pre-rewrite code refused an earn only at full cap saturation and
  // silently clamped a partial overflow: at balance 3 under a cap of 5, an
  // earn of 3 became balance 5 with earned_total 6. That clamping is a
  // second way to break balance = earned - spent, since earned_total still
  // counted the refused amount. The rewrite refuses any overflow instead.

  test("a partial overflow is refused, not clamped to the cap", async () => {
    await setStoryPointCap(db, ACTOR, null, 5,);
    await earnStoryPoints(db, { actorId: ACTOR, amount: 3, },);

    // Would be 6 against a cap of 5 — refused, and nothing is credited.
    await expect(
      earnStoryPoints(db, { actorId: ACTOR, amount: 3, },),
    ).rejects.toBeInstanceOf(CapExceededError,);

    const bal = await getStoryPointBalance(db, ACTOR, null,);
    expect(bal.balance,).toBe(3,);
    // The invariant the old clamp broke.
    expect(bal.earned_total,).toBe(3,);
    expect(bal.balance,).toBe(bal.earned_total - bal.spent_total,);
  });

  test("an earn that exactly reaches the cap still succeeds", async () => {
    await setStoryPointCap(db, ACTOR, null, 5,);
    await earnStoryPoints(db, { actorId: ACTOR, amount: 5, },);

    const bal = await getStoryPointBalance(db, ACTOR, null,);
    expect(bal.balance,).toBe(5,);
    expect(bal.earned_total,).toBe(5,);
  });

  test("an overflow far past the cap is refused and credits nothing", async () => {
    await setStoryPointCap(db, ACTOR, null, 5,);
    await earnStoryPoints(db, { actorId: ACTOR, amount: 5, },);

    await expect(
      earnStoryPoints(db, { actorId: ACTOR, amount: 100, },),
    ).rejects.toBeInstanceOf(CapExceededError,);

    const bal = await getStoryPointBalance(db, ACTOR, null,);
    expect(bal.balance,).toBe(5,);
    expect(bal.earned_total,).toBe(5,);
  });

  test("parallel earns under a cap never overshoot it and keep the invariant", async () => {
    await setStoryPointCap(db, ACTOR, null, 10,);

    const results = await Promise.allSettled(
      Array.from({ length: 8, }, () => earnStoryPoints(db, { actorId: ACTOR, amount: 3, },),),
    );

    const accepted = results.filter((r,) => r.status === "fulfilled").length;
    const bal = await getStoryPointBalance(db, ACTOR, null,);

    // The cap is a hard ceiling regardless of how the earns interleave.
    expect(bal.balance,).toBeLessThanOrEqual(10,);
    // Only accepted earns are counted, so the two totals stay consistent.
    expect(bal.earned_total,).toBe(accepted * 3,);
    expect(bal.balance,).toBe(bal.earned_total - bal.spent_total,);
  });

  test("an earn is scoped to its own world and never leaks across", async () => {
    await earnStoryPoints(db, { actorId: ACTOR, worldId: WORLD, amount: 7, },);
    await earnStoryPoints(db, { actorId: ACTOR, amount: 4, },);

    const world = await getStoryPointBalance(db, ACTOR, WORLD,);
    const global = await getStoryPointBalance(db, ACTOR, null,);
    expect(world.balance,).toBe(7,);
    expect(global.balance,).toBe(4,);
  });

  test("a second earn on an existing world row credits that world only", async () => {
    // Exercises the UPDATE branch's `world_id IS ?` predicate for a non-NULL
    // world, which the NULL-world path cannot cover.
    await earnStoryPoints(db, { actorId: ACTOR, worldId: WORLD, amount: 5, },);
    await earnStoryPoints(db, { actorId: ACTOR, worldId: WORLD, amount: 3, },);

    const world = await getStoryPointBalance(db, ACTOR, WORLD,);
    expect(world.balance,).toBe(8,);
    expect(world.earned_total,).toBe(8,);
  });
});

describe("spendStoryPoints — concurrency", () => {
  // spendStoryPoints took the same SELECT-then-INSERT shape against the same
  // 020 partial unique index that earnStoryPoints had, so concurrent
  // first-time spends all reached the INSERT and every loser but one raised a
  // raw `SQLiteError: UNIQUE constraint failed` instead of the intended
  // InsufficientStoryPointsError. Same table, same index, same defect class.

  test("parallel first-time spends report insufficiency, not a raw UNIQUE error", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 6, }, () => spendStoryPoints(db, { actorId: ACTOR, amount: 1, },),),
    );

    // Every rejection must be the domain error. A SQLiteError here means the
    // conflict clause regressed.
    for (const r of results) {
      expect(r.status,).toBe("rejected",);
      expect((r as PromiseRejectedResult).reason,).toBeInstanceOf(InsufficientStoryPointsError,);
    }
  });

  test("a refused first-time spend leaves no phantom row behind", async () => {
    await expect(
      spendStoryPoints(db, { actorId: ACTOR, amount: 1, },),
    ).rejects.toBeInstanceOf(InsufficientStoryPointsError,);

    // The seeded zero row is rolled back with the failed transaction, so a
    // read still reports an actor that has never been seen.
    const rows = raw
      .query("SELECT COUNT(*) AS n FROM actor_story_points WHERE actor_id = ?",)
      .get(ACTOR,) as { n: number };
    expect(rows.n,).toBe(0,);
  });

  test("a spend racing a concurrent earn on a fresh actor leaves one row", async () => {
    const results = await Promise.allSettled([
      earnStoryPoints(db, { actorId: ACTOR, amount: 5, },),
      spendStoryPoints(db, { actorId: ACTOR, amount: 1, },),
    ],);

    const rows = raw
      .query("SELECT COUNT(*) AS n FROM actor_story_points WHERE actor_id = ?",)
      .get(ACTOR,) as { n: number };
    expect(rows.n,).toBe(1,);
    // Whichever order the two took, the row's totals stay consistent.
    const bal = await getStoryPointBalance(db, ACTOR, null,);
    expect(bal.balance,).toBe(bal.earned_total - bal.spent_total,);
    expect(results.some((r,) => r.status === "fulfilled"),).toBe(true,);
  });

  test("parallel spends cannot overdraw the balance", async () => {
    await earnStoryPoints(db, { actorId: ACTOR, amount: 10, },);

    // Three spends of 4 against a balance of 10: two fit (8), the third
    // cannot. The balance must never go negative, and the losers must report
    // the domain error rather than a raw constraint violation.
    const results = await Promise.allSettled(
      Array.from({ length: 3, }, () => spendStoryPoints(db, { actorId: ACTOR, amount: 4, },),),
    );

    const ok = results.filter((r,) => r.status === "fulfilled").length;
    expect(ok,).toBe(2,);
    for (const r of results) {
      if (r.status === "rejected") {
        expect(r.reason,).toBeInstanceOf(InsufficientStoryPointsError,);
      }
    }

    const bal = await getStoryPointBalance(db, ACTOR, null,);
    expect(bal.balance,).toBe(2,);
    expect(bal.spent_total,).toBe(8,);
    expect(bal.balance,).toBeGreaterThanOrEqual(0,);
  });

  test("parallel spends that all fit debit every one of them", async () => {
    await earnStoryPoints(db, { actorId: ACTOR, amount: 10, },);

    // Three spends of 3 total 9, which the balance covers: all three land
    // and the total is exact. This is the case a naive "only one concurrent
    // write wins" guard would wrongly refuse.
    const results = await Promise.allSettled(
      Array.from({ length: 3, }, () => spendStoryPoints(db, { actorId: ACTOR, amount: 3, },),),
    );

    expect(results.filter((r,) => r.status === "fulfilled").length,).toBe(3,);
    const bal = await getStoryPointBalance(db, ACTOR, null,);
    expect(bal.balance,).toBe(1,);
    expect(bal.spent_total,).toBe(9,);
  });
});

describe("refreshActorStoryPointsCache - best-effort contract", () => {
  test("resolves instead of rejecting when the denormalization fails", async () => {
    // A closed handle makes getStoryPointBalance throw. The refresh is
    // best-effort: the canonical ledger is already committed by the time it
    // runs, so the failure is logged and absorbed rather than propagated.
    //
    // This is exactly what lets earn/spend call it as a bare `void` with no
    // .catch() - without the internal try/catch those call sites would emit
    // an unhandled rejection.
    // BUG-story-points-mutations-double-swallow-cache-refresh-failures.
    const { db: dead, raw: deadRaw, } = await createInMemoryDb();
    deadRaw.close();

    await expect(
      refreshActorStoryPointsCache(dead, ACTOR, null,),
    ).resolves.toBeUndefined();
  });
});

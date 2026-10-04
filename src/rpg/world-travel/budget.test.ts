// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/rpg/world-travel/budget.test.ts — direct unit tests for readBudget,
 * toSqlDate, and the windowStart rewind path not exercised through
 * advancePartyTravel.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, insertWorlds, insertWorldTravelBudget, } from "../../test-utils/insert-helpers";
import { readBudget, toSqlDate, } from "./budget";

let db: Kysely<DB>;

beforeEach(async () => {
  ({ db, } = await createTestDb());
  await insertUsers(db, "owner", "Owner", { id: "user-owner", },);
  await insertWorlds(db, "user-owner", "Test World", { id: "w1", },);
},);

afterEach(async () => {
  await db.destroy();
},);

describe("readBudget", () => {
  test("no ledger row reports zero spend and the caller ceiling", async () => {
    const state = await readBudget(db, "w1", 5, 2,);
    expect(state,).toEqual({ spent: 0, ceiling: 2, remaining: 2, windowStartTick: 5, },);
  });

  test("a row inside the window reports the persisted spend", async () => {
    await insertWorldTravelBudget(db, { world_id: "w1", spent: 0.3, ceiling: 1, window_start_tick: 0, },);
    const state = await readBudget(db, "w1", 5, 1,);
    expect(state.spent,).toBe(0.3,);
    expect(state.ceiling,).toBe(1,);
    expect(state.remaining,).toBe(0.7,);
    expect(state.windowStartTick,).toBe(0,);
  });

  test("a row past the window rolls forward and zeroes spend", async () => {
    await insertWorldTravelBudget(db, { world_id: "w1", spent: 0.8, ceiling: 1, window_start_tick: 0, },);
    const state = await readBudget(db, "w1", 15, 1,);
    expect(state.spent,).toBe(0,);
    expect(state.windowStartTick,).toBe(10,);
  });

  test("a rewind below the window start anchors on the tick", async () => {
    await insertWorldTravelBudget(db, { world_id: "w1", spent: 0.5, ceiling: 1, window_start_tick: 10, },);
    const state = await readBudget(db, "w1", 3, 1,);
    expect(state.windowStartTick,).toBe(3,);
    expect(state.spent,).toBe(0,);
  });

  test("remaining is floored at zero when spend exceeds ceiling", async () => {
    await insertWorldTravelBudget(db, { world_id: "w1", spent: 1.5, ceiling: 1, window_start_tick: 0, },);
    const state = await readBudget(db, "w1", 5, 1,);
    expect(state.remaining,).toBe(0,);
  });
});

describe("toSqlDate", () => {
  test("formats an epoch-millisecond instant as SQLite datetime text", () => {
    const ms = Date.UTC(2026, 9, 4, 12, 34, 56, 789,);
    expect(toSqlDate(ms,),).toBe("2026-10-04 12:34:56",);
  });

  test("strips fractional seconds and the Z suffix", () => {
    const ms = Date.UTC(2026, 0, 1, 0, 0, 0, 0,);
    expect(toSqlDate(ms,),).toBe("2026-01-01 00:00:00",);
  });
});

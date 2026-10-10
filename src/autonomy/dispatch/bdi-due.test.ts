// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/autonomy/dispatch/bdi-due.test.ts — the two selection primitives
 * `createBdiDispatch` delegates to.
 *
 * `dispatch-targets.test.ts` drives them only through the dispatch's own
 * skip vocabulary, which cannot separate "not a member" from "planned but
 * off-cadence" from "an age step that refused to move the counter". These
 * cases read the tables directly and pin the boundaries: the interval edge
 * (`interval - 1` / `interval` / `interval + 1`), interval 0 as "cadence
 * disabled", world and date scoping on both sides, and the id-sorted,
 * limit-sliced shape of the returned due set.
 *
 * No `mock.module` here: both functions take a real migrated in-memory DB.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActorDailyPlans,
  insertActors,
  insertUsers,
  insertWorldMembers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { ageReflectionSteps, dueActors, } from "./bdi-due";

let db: Kysely<DB>;

const WORLD_ID = "world-bdi-due";
const OTHER_WORLD_ID = "world-bdi-due-other";

/** Every date-sensitive case uses the same literal — no clock reading. */
const TODAY = "2026-01-01";
const YESTERDAY = "2025-12-31";

beforeEach(async () => {
  ({ db, } = await createTestDb());
},);

afterEach(async () => {
  await db.destroy();
},);

/** Two worlds under one owner — the scoping cases need a foreign world. */
async function makeWorlds(): Promise<void> {
  await insertUsers(db, "due-owner", "Owner", { id: "user-due-owner", },);
  await insertWorlds(db, "user-due-owner", "Due World", { id: WORLD_ID, },);
  await insertWorlds(db, "user-due-owner", "Other World", { id: OTHER_WORLD_ID, },);
}

/** An actor that belongs to `worldId` — one row of the candidate pool. */
async function addMember(worldId: string, actorId: string,): Promise<void> {
  await insertActors(db, actorId, { id: actorId, actor_type: "character", agent_type: "npc", },);
  await insertWorldMembers(db, worldId, actorId,);
}

/** A plan for `planDate` with a configurable step counter. `worldId`
 *  defaults to the world under test; pass `null` for a legacy unscoped plan. */
async function addPlan(
  actorId: string,
  steps: number,
  opts?: { planDate?: string; worldId?: string | null; id?: string },
): Promise<string> {
  return insertActorDailyPlans(db, actorId, opts?.planDate ?? TODAY, "old", {
    id: opts?.id ?? `plan-${actorId}`,
    world_id: opts?.worldId === undefined ? WORLD_ID : opts.worldId,
    priority: "normal",
    reflection_step_count: steps,
  },);
}

/** The counter a single plan row currently holds. */
async function stepCount(planId: string,): Promise<number | undefined> {
  const row = await db
    .selectFrom("actor_daily_plans",)
    .select("reflection_step_count",)
    .where("id", "=", planId,)
    .executeTakeFirst();

  return row?.reflection_step_count;
}

describe("dueActors — unplanned members", () => {
  test("a world with no members has nobody due", async () => {
    await makeWorlds();

    expect(await dueActors(db, WORLD_ID, TODAY, 10, 0,),).toEqual([],);
  });

  test("a member with no plan for the date is due", async () => {
    await makeWorlds();
    await addMember(WORLD_ID, "actor-free",);

    expect(await dueActors(db, WORLD_ID, TODAY, 10, 0,),).toEqual(["actor-free",],);
  });

  test("a plan on another date does not make the member off-cadence", async () => {
    await makeWorlds();
    await addMember(WORLD_ID, "actor-yesterday",);
    await addPlan("actor-yesterday", 0, { planDate: YESTERDAY, },);

    expect(await dueActors(db, WORLD_ID, TODAY, 10, 0,),).toEqual(["actor-yesterday",],);
  });

  test("a plan belonging to another world does not suppress the member", async () => {
    await makeWorlds();
    await addMember(WORLD_ID, "actor-loaned",);
    await addPlan("actor-loaned", 0, { worldId: OTHER_WORLD_ID, },);

    expect(await dueActors(db, WORLD_ID, TODAY, 10, 0,),).toEqual(["actor-loaned",],);
  });

  test("a legacy plan with no world is invisible to the world's due set", async () => {
    await makeWorlds();
    await addMember(WORLD_ID, "actor-legacy",);
    await addPlan("actor-legacy", 0, { worldId: null, },);

    expect(await dueActors(db, WORLD_ID, TODAY, 10, 0,),).toEqual(["actor-legacy",],);
  });

  test("a member of another world is never in this world's due set", async () => {
    await makeWorlds();
    await addMember(OTHER_WORLD_ID, "actor-foreign",);
    await addMember(WORLD_ID, "actor-local",);

    expect(await dueActors(db, WORLD_ID, TODAY, 10, 0,),).toEqual(["actor-local",],);
  });
});

describe("dueActors — cadence interval edge", () => {
  test("a planned member is off-cadence with the interval disabled (0)", async () => {
    await makeWorlds();
    await addMember(WORLD_ID, "actor-calm",);
    await addPlan("actor-calm", 99,);

    expect(await dueActors(db, WORLD_ID, TODAY, 10, 0,),).toEqual([],);
  });

  test("one step below the interval stays off-cadence", async () => {
    await makeWorlds();
    await addMember(WORLD_ID, "actor-young",);
    await addPlan("actor-young", 2,);

    expect(await dueActors(db, WORLD_ID, TODAY, 10, 3,),).toEqual([],);
  });

  test("exactly at the interval becomes due", async () => {
    await makeWorlds();
    await addMember(WORLD_ID, "actor-ripe",);
    await addPlan("actor-ripe", 3,);

    expect(await dueActors(db, WORLD_ID, TODAY, 10, 3,),).toEqual(["actor-ripe",],);
  });

  test("past the interval (capped counter) stays due", async () => {
    await makeWorlds();
    await addMember(WORLD_ID, "actor-over",);
    await addPlan("actor-over", 4,);

    expect(await dueActors(db, WORLD_ID, TODAY, 10, 3,),).toEqual(["actor-over",],);
  });

  test("a due-cadence plan on another date or in another world does not join the set", async () => {
    await makeWorlds();
    await addMember(WORLD_ID, "actor-stale",);
    // A today plan in THIS world keeps the member off the unplanned branch;
    // only the cadence branch could re-admit it, and none of the
    // out-of-scope plans are in that query's scope.
    await addPlan("actor-stale", 1, { id: "plan-today", },);
    await addPlan("actor-stale", 9, { planDate: YESTERDAY, id: "plan-yesterday", },);
    await addPlan("actor-stale", 9, { worldId: OTHER_WORLD_ID, id: "plan-foreign", },);
    await addPlan("actor-stale", 9, { worldId: null, id: "plan-legacy", },);

    expect(await dueActors(db, WORLD_ID, TODAY, 10, 3,),).toEqual([],);
  });

  test("unplanned and at-interval members union into one set", async () => {
    await makeWorlds();
    await addMember(WORLD_ID, "actor-fresh",);
    await addMember(WORLD_ID, "actor-ripe",);
    await addMember(WORLD_ID, "actor-young",);
    await addPlan("actor-ripe", 3,);
    await addPlan("actor-young", 1,);

    expect(await dueActors(db, WORLD_ID, TODAY, 10, 3,),).toEqual(["actor-fresh", "actor-ripe",],);
  });

  test("two qualifying plans for one actor yield it once", async () => {
    await makeWorlds();
    await addMember(WORLD_ID, "actor-twice",);
    await addPlan("actor-twice", 3, { id: "plan-a", },);
    await addPlan("actor-twice", 5, { id: "plan-b", },);

    expect(await dueActors(db, WORLD_ID, TODAY, 10, 3,),).toEqual(["actor-twice",],);
  });
});

describe("dueActors — ordering and limit", () => {
  test("the due set is id-sorted, not insertion-ordered", async () => {
    await makeWorlds();
    await addMember(WORLD_ID, "actor-c",);
    await addMember(WORLD_ID, "actor-a",);
    await addMember(WORLD_ID, "actor-b",);

    expect(await dueActors(db, WORLD_ID, TODAY, 10, 0,),).toEqual(["actor-a", "actor-b", "actor-c",],);
  });

  test("limit slices off the tail in sorted order", async () => {
    await makeWorlds();
    await addMember(WORLD_ID, "actor-a",);
    await addMember(WORLD_ID, "actor-b",);
    await addMember(WORLD_ID, "actor-c",);

    expect(await dueActors(db, WORLD_ID, TODAY, 2, 0,),).toEqual(["actor-a", "actor-b",],);
  });

  test("a limit of zero yields the empty set even with members due", async () => {
    await makeWorlds();
    await addMember(WORLD_ID, "actor-a",);

    expect(await dueActors(db, WORLD_ID, TODAY, 0, 0,),).toEqual([],);
  });

  test("a limit above the member count returns everything", async () => {
    await makeWorlds();
    await addMember(WORLD_ID, "actor-only",);

    expect(await dueActors(db, WORLD_ID, TODAY, 100, 0,),).toEqual(["actor-only",],);
  });
});

describe("ageReflectionSteps", () => {
  test("a world with no plans ages nothing", async () => {
    await makeWorlds();
    await addMember(WORLD_ID, "actor-a",);

    await ageReflectionSteps(db, WORLD_ID, TODAY, 3,);

    expect(await dueActors(db, WORLD_ID, TODAY, 10, 3,),).toEqual(["actor-a",],);
  });

  test("a counter below the interval ages by exactly one", async () => {
    await makeWorlds();
    await addPlan("actor-a", 0,);

    await ageReflectionSteps(db, WORLD_ID, TODAY, 3,);

    expect(await stepCount("plan-actor-a",),).toBe(1,);
  });

  test("one below the interval lands exactly on it", async () => {
    await makeWorlds();
    await addPlan("actor-a", 2,);

    await ageReflectionSteps(db, WORLD_ID, TODAY, 3,);

    expect(await stepCount("plan-actor-a",),).toBe(3,);
  });

  test("a counter at the interval does not move", async () => {
    await makeWorlds();
    await addPlan("actor-a", 3,);

    await ageReflectionSteps(db, WORLD_ID, TODAY, 3,);

    expect(await stepCount("plan-actor-a",),).toBe(3,);
  });

  test("a counter above the interval is left alone, never clamped down", async () => {
    await makeWorlds();
    await addPlan("actor-a", 7,);

    await ageReflectionSteps(db, WORLD_ID, TODAY, 3,);

    expect(await stepCount("plan-actor-a",),).toBe(7,);
  });

  test("an interval of zero ages nothing", async () => {
    await makeWorlds();
    await addPlan("actor-a", 0,);

    await ageReflectionSteps(db, WORLD_ID, TODAY, 0,);

    expect(await stepCount("plan-actor-a",),).toBe(0,);
  });

  test("plans on another date or in another world are untouched", async () => {
    await makeWorlds();
    await addPlan("actor-a", 0, { planDate: YESTERDAY, id: "plan-yesterday", },);
    await addPlan("actor-b", 0, { worldId: OTHER_WORLD_ID, id: "plan-foreign", },);
    await addPlan("actor-c", 0, { worldId: null, id: "plan-legacy", },);

    await ageReflectionSteps(db, WORLD_ID, TODAY, 3,);

    expect(await stepCount("plan-yesterday",),).toBe(0,);
    expect(await stepCount("plan-foreign",),).toBe(0,);
    expect(await stepCount("plan-legacy",),).toBe(0,);
  });

  test("every due plan in the world ages in the same step", async () => {
    await makeWorlds();
    await addPlan("actor-a", 0, { id: "plan-a", },);
    await addPlan("actor-b", 1, { id: "plan-b", },);

    await ageReflectionSteps(db, WORLD_ID, TODAY, 3,);

    expect(await stepCount("plan-a",),).toBe(1,);
    expect(await stepCount("plan-b",),).toBe(2,);
  });

  test("repeated aging saturates at the interval", async () => {
    await makeWorlds();
    await addPlan("actor-a", 0,);

    await ageReflectionSteps(db, WORLD_ID, TODAY, 3,);
    await ageReflectionSteps(db, WORLD_ID, TODAY, 3,);
    await ageReflectionSteps(db, WORLD_ID, TODAY, 3,);
    await ageReflectionSteps(db, WORLD_ID, TODAY, 3,);

    expect(await stepCount("plan-actor-a",),).toBe(3,);
  });

  test("aging walks a plan from off-cadence to due at the interval", async () => {
    await makeWorlds();
    await addMember(WORLD_ID, "actor-a",);
    await addPlan("actor-a", 1,);

    expect(await dueActors(db, WORLD_ID, TODAY, 10, 3,),).toEqual([],);
    await ageReflectionSteps(db, WORLD_ID, TODAY, 3,);
    expect(await dueActors(db, WORLD_ID, TODAY, 10, 3,),).toEqual([],);
    await ageReflectionSteps(db, WORLD_ID, TODAY, 3,);
    expect(await dueActors(db, WORLD_ID, TODAY, 10, 3,),).toEqual(["actor-a",],);
  });
});

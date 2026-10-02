// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `createPlanRecompute` — the production BDI plan generator.
 *
 * The nightly cycle's plan slot was previously only ever filled by test
 * stubs, so nothing drove the real generator. This exercises the DI seam
 * (`generate`) so the parse / degrade / cap / vocabulary rules are
 * reachable offline, plus integration through `runNightlyReflectionCycle`
 * that pins the budget-denial order: a denied actor never reaches the
 * generator and never gets a plan row.
 *
 * Covered:
 *   - a well-formed response is parsed into the stored plan shape
 *   - the prompt carries the DB-derived facts the plan derives from
 *   - a malformed response degrades to the deterministic state-derived
 *     plan and does not throw
 *   - a THROWING generator still yields a plan (does not propagate)
 *   - activities are capped at MAX_ACTIVITIES when the model returns more
 *   - an unrecognized `priority` is malformed: fallback, never a new
 *     column value
 *   - a denied budget never calls the generator and writes no plan row
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertLocations,
  insertLocationStates,
  insertNpcStates,
  insertUsers,
  insertWorldMembers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { runNightlyReflectionCycle, } from "./bdi-nightly";
import { createPlanRecompute, type PlanTextGenerator, } from "./bdi-plan-recompute";
import { MAX_ACTIVITIES, PLAN_PRIORITIES, } from "./bdi-plan-shape";

let db: Kysely<DB>;

beforeEach(async () => {
  ({ db, } = await createTestDb());
},);

afterEach(async () => {
  await db.destroy();
},);

/** The priority vocabulary as a plain `string[]`.
 *
 * `actor_daily_plans.priority` is a TEXT column, so what comes back is a
 * `string` — the membership assertion has to be against `string[]`, not
 * the narrower literal union. Widening the CONTAINER keeps the assertion
 * exact: it still fails on any priority outside the four buckets.
 */
const PRIORITY_VOCABULARY: string[] = Object.values(PLAN_PRIORITIES,);

/** A world + an NPC actor at a named location, patrolling. Every fact
 *  `loadFacts` reads resolves to a real value, so a state-derived plan is
 *  deterministic and distinguishable from anything a model returned. */
async function makeNpc(name: string,) {
  const ownerId = uid();
  const worldId = uid();
  await insertUsers(db, "owner-" + ownerId, "Owner", { id: ownerId, },);
  await insertWorlds(db, ownerId, "World " + name, { id: worldId, },);

  const locationId = uid();
  await insertLocations(db, worldId, name + " Square", { id: locationId, },);
  await insertLocationStates(db, locationId, worldId,);

  const actorId = uid();
  await insertActors(db, "Watcher " + name, { id: actorId, actor_type: "character", agent_type: "npc", },);
  await insertWorldMembers(db, worldId, actorId,);
  await insertNpcStates(db, actorId, worldId, {
    location_id: locationId,
    health: 100,
    mental_state: "calm",
    schedule: JSON.stringify({ movementPattern: "patrol", },),
  },);
  return { worldId, actorId, locationId, };
}

/** A generator returning one canned string, recording its calls. */
function canned(raw: string,) {
  const calls: Array<{ actorId: string; actorName: string; userMessage: string }> = [];
  const generate: PlanTextGenerator = (req,) => {
    const user = req.messages.find((m,) => m.role === "user");
    calls.push({ actorId: req.actorId, actorName: req.actorName, userMessage: user?.content ?? "", },);
    return Promise.resolve(raw,);
  };
  return { generate, calls, };
}

describe("createPlanRecompute — well-formed model output", () => {
  test("a fenced JSON plan is parsed into the stored shape", async () => {
    const { worldId, actorId, } = await makeNpc("parsed",);
    const fenced = [
      "Here you go:",
      "```json",
      JSON.stringify({
        summary: "  Patrol the square, then rest.  ",
        priority: "HIGH",
        activities: [
          { description: "walk the perimeter", score: 70.4, },
          { description: "drink something", score: 12, },
        ],
      },),
      "```",
    ].join("\n",);
    const { generate, calls, } = canned(fenced,);

    const plan = await createPlanRecompute({ db, generate, },)(actorId, worldId, "2026-10-02",);

    expect(plan.summary,).toBe("Patrol the square, then rest.",);
    expect(plan.priority,).toBe(PLAN_PRIORITIES.High,);
    expect(plan.activities,).toEqual([
      { description: "walk the perimeter", score: 70, },
      { description: "drink something", score: 12, },
    ],);
    expect(calls.length,).toBe(1,);
  });

  test("the prompt carries the DB-derived facts, not just the actor id", async () => {
    const { worldId, actorId, } = await makeNpc("facts",);
    const { generate, calls, } = canned(
      JSON.stringify({ summary: "s", priority: "normal", activities: [{ description: "a", score: 1, },], },),
    );

    await createPlanRecompute({ db, generate, },)(actorId, worldId, "2026-10-02",);

    const call = calls[0]!;
    expect(call.actorId,).toBe(actorId,);
    expect(call.actorName,).toBe("Watcher facts",);
    expect(call.userMessage,).toContain("2026-10-02",);
    expect(call.userMessage,).toContain("Watcher facts",);
    expect(call.userMessage,).toContain("facts Square",);
    expect(call.userMessage,).toContain("100",);
    expect(call.userMessage,).toContain("patrol",);
  });
});

describe("createPlanRecompute — degraded model output", () => {
  test("malformed text yields the state-derived plan, no throw", async () => {
    const { worldId, actorId, locationId, } = await makeNpc("malformed",);
    const { generate, } = canned("I'm sorry Dave, I'm afraid I can't do that.",);
    const recompute = createPlanRecompute({ db, generate, },);

    const plan = await recompute(actorId, worldId, "2026-10-02",);

    // State-derived, not anything the model said: health 100 + mental calm
    // => Normal, and the summary names the actor's own location.
    expect(plan.priority,).toBe(PLAN_PRIORITIES.Normal,);
    expect(plan.summary,).toContain("malformed Square",);
    expect(plan.summary,).toContain("patrol",);
    expect(plan.activities[0]?.description,).toBe("Keep to malformed Square and mind local business.",);
    expect(plan.activities[1]?.description,).toBe("Continue the patrol round out of malformed Square.",);
    expect(plan.activities[0]?.score,).toBe(50,);
    // The activity description is built from the location, not the model.
    expect(locationId.length,).toBeGreaterThan(0,);

    // Same state + same malformed input => same plan, twice over.
    expect(await recompute(actorId, worldId, "2026-10-02",),).toEqual(plan,);
  });

  test("a THROWING generator yields the fallback plan instead of propagating", async () => {
    const { worldId, actorId, } = await makeNpc("throwing",);
    const recompute = createPlanRecompute({
      db,
      generate: () => Promise.reject(new Error("provider 503",),),
    },);

    const plan = await recompute(actorId, worldId, "2026-10-02",);

    expect(plan.priority,).toBe(PLAN_PRIORITIES.Normal,);
    expect(plan.summary,).toContain("throwing Square",);
    expect(plan.activities.length,).toBeGreaterThan(0,);
  });

  test("an unrecognized priority is malformed — never written through", async () => {
    const { worldId, actorId, } = await makeNpc("badpriority",);
    const { generate, } = canned(
      JSON.stringify({
        summary: "model summary that must be discarded",
        priority: "catastrophic",
        activities: [{ description: "model activity", score: 99, },],
      },),
    );

    const plan = await createPlanRecompute({ db, generate, },)(actorId, worldId, "2026-10-02",);

    // The plan is the state-derived one: no model text survives, and the
    // priority stayed inside the vocabulary rather than becoming a new
    // column value.
    expect(PRIORITY_VOCABULARY,).toContain(plan.priority,);
    expect(plan.priority,).not.toBe("catastrophic",);
    expect(plan.summary,).not.toBe("model summary that must be discarded",);
    expect(plan.summary,).toContain("badpriority Square",);
  });
});

describe("createPlanRecompute — activity cap", () => {
  test("more activities than MAX_ACTIVITIES are truncated to the cap", async () => {
    const { worldId, actorId, } = await makeNpc("capped",);
    const { generate, } = canned(
      JSON.stringify({
        summary: "busy day",
        priority: "normal",
        activities: Array.from({ length: MAX_ACTIVITIES + 4, }, (_, i,) => ({
          description: "task " + i,
          score: i,
        }),),
      },),
    );

    const plan = await createPlanRecompute({ db, generate, },)(actorId, worldId, "2026-10-02",);

    expect(plan.activities.length,).toBe(MAX_ACTIVITIES,);
    // The retained rows are the model's FIRST five, not an arbitrary five.
    expect(plan.activities.map((a,) => a.description),).toEqual([
      "task 0",
      "task 1",
      "task 2",
      "task 3",
      "task 4",
    ],);
  });

  test("an explicit maxActivities caps below the default", async () => {
    const { worldId, actorId, } = await makeNpc("capped-low",);
    const { generate, } = canned(
      JSON.stringify({
        summary: "busy day",
        priority: "normal",
        activities: [{ description: "one", score: 1, }, { description: "two", score: 2, },],
      },),
    );

    const plan = await createPlanRecompute({ db, generate, maxActivities: 1, },)(actorId, worldId, "2026-10-02",);
    expect(plan.activities,).toEqual([{ description: "one", score: 1, },],);
  });
});

describe("runNightlyReflectionCycle — budget denial", () => {
  test("a denied actor never reaches the generator and gets no plan row", async () => {
    const allowed = await makeNpc("allowed",);
    const denied = await makeNpc("denied",);
    const { generate, calls, } = canned(
      JSON.stringify({
        summary: "a fine day",
        priority: "low",
        activities: [{ description: "rest", score: 5, },],
      },),
    );

    const result = await runNightlyReflectionCycle(
      db,
      [allowed.actorId, denied.actorId,],
      {
        budgetApprove: async (id,) => Promise.resolve(id === allowed.actorId,),
        planRecompute: createPlanRecompute({ db, generate, },),
        today: "2026-10-02",
      },
    );

    expect(result.processed,).toBe(1,);
    expect(result.skippedBudget,).toBe(1,);
    // The generator ran once, for the allowed actor only — the denied
    // actor is skipped before any LLM cost.
    expect(calls.map((c,) => c.actorId),).toEqual([allowed.actorId,],);

    const plans = await db
      .selectFrom("actor_daily_plans",)
      .select(["actor_id", "world_id", "summary", "priority",],)
      .execute();
    expect(plans.length,).toBe(1,);
    expect(plans[0]?.actor_id,).toBe(allowed.actorId,);
    expect(plans[0]?.world_id,).toBe(allowed.worldId,);
    expect(plans[0]?.summary,).toBe("a fine day",);
    expect(plans[0]?.priority,).toBe(PLAN_PRIORITIES.Low,);

    const activities = await db.selectFrom("actor_planned_activities",).select("description",).execute();
    expect(activities.map((a,) => a.description),).toEqual(["rest",],);
  });

  test("a malformed response still persists a plan with a vocabulary priority", async () => {
    const npc = await makeNpc("persisted",);
    const { generate, } = canned("not json at all",);

    const result = await runNightlyReflectionCycle(db, [npc.actorId,], {
      budgetApprove: () => Promise.resolve(true,),
      planRecompute: createPlanRecompute({ db, generate, },),
      today: "2026-10-02",
    },);

    expect(result.processed,).toBe(1,);
    const plan = await db
      .selectFrom("actor_daily_plans",)
      .select(["summary", "priority",],)
      .where("actor_id", "=", npc.actorId,)
      .executeTakeFirstOrThrow();
    expect(PRIORITY_VOCABULARY,).toContain(plan.priority,);
    expect(plan.summary,).toContain("persisted Square",);
  });
});

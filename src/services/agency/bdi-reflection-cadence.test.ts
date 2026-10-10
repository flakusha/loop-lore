// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Database, } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db";
import { createInMemoryDb, } from "./__helpers/in-mem-db";
import { runNightlyReflectionCycle, } from "./bdi-nightly";
import {
  DEFAULT_REFLECTION_STEP_INTERVAL,
  resetReflectionSteps,
  shouldReflectAt,
} from "./bdi-reflection";

describe("reflection cadence default", () => {
  test("DEFAULT_REFLECTION_STEP_INTERVAL is 0 (once-per-night preserved)", () => {
    expect(DEFAULT_REFLECTION_STEP_INTERVAL,).toBe(0,);
  });
});

let db: Kysely<DB>;
let raw: Database;

beforeEach(async () => {
  ({ db, raw, } = await createInMemoryDb());
},);

afterEach(() => {
  raw.close();
},);

/** Seed an existing plan for today with a configurable step counter. */
async function seedPlan(actorId: string, priority: string, steps = 0,): Promise<string> {
  raw.exec(
    `INSERT INTO actor_daily_plans(id, actor_id, plan_date, summary, priority, created_at, reflection_step_count)` +
      ` VALUES ('plan-${actorId}', '${actorId}', '2026-09-25', 'old', '${priority}', datetime('now'), ${steps});`,
  );

  return `plan-${actorId}`;
}

const STATIC_RECOMPUTE = {
  budgetApprove: async () => true,
  planRecompute: async () => ({ summary: "hold", priority: "normal", activities: [], }),
  today: "2026-09-25",
};

describe("reflection cadence primitives", () => {
  test("shouldReflectAt gates on a positive interval only", () => {
    expect(shouldReflectAt(4, 4,),).toBe(true,);
    expect(shouldReflectAt(5, 4,),).toBe(true,);
    expect(shouldReflectAt(3, 4,),).toBe(false,);
    // Interval 0 = disabled, regardless of accumulated steps.
    expect(shouldReflectAt(99, 0,),).toBe(false,);
  });

  test("resetReflectionSteps zeroes the counter", async () => {
    const planId = await seedPlan("actor1", "normal", 4,);
    await resetReflectionSteps(db, planId,);

    const row = raw.query("SELECT reflection_step_count FROM actor_daily_plans WHERE id='plan-actor1'",).get() as {
      reflection_step_count: number;
    };

    expect(row.reflection_step_count,).toBe(0,);
  });
});

describe("runNightlyReflectionCycle — cadence-driven checkpoints", () => {
  test("interval 0 keeps the legacy shift-only behavior (no counter reset)", async () => {
    const planId = await seedPlan("actor1", "normal", 2,);
    const result = await runNightlyReflectionCycle(db, ["actor1",], STATIC_RECOMPUTE,);

    expect(result.revisionsEmitted,).toBe(0,);
    const row = raw.query("SELECT reflection_step_count FROM actor_daily_plans WHERE id=?",).get(planId,) as {
      reflection_step_count: number;
    };

    expect(row.reflection_step_count,).toBe(2,);
  });

  test("interval reached with unchanged priority → checkpoint attempted, no revision, counter reset", async () => {
    const planId = await seedPlan("actor1", "normal", 4,);
    const result = await runNightlyReflectionCycle(db, ["actor1",], {
      ...STATIC_RECOMPUTE,
      reflectionStepInterval: 4,
    },);

    expect(result.processed,).toBe(1,);
    expect(result.revisionsEmitted,).toBe(0,);
    expect(result.decisionEvents,).toEqual([],);
    const revs = raw.query("SELECT * FROM actor_plan_revisions",).all();
    expect(revs.length,).toBe(0,);
    const row = raw.query("SELECT reflection_step_count FROM actor_daily_plans WHERE id=?",).get(planId,) as {
      reflection_step_count: number;
    };

    expect(row.reflection_step_count,).toBe(0,);
  });

  test("interval reached with shifted priority → PlanRevision emitted and counter reset", async () => {
    const planId = await seedPlan("actor1", "normal", 4,);
    const result = await runNightlyReflectionCycle(db, ["actor1",], {
      budgetApprove: async () => true,
      planRecompute: async () => ({ summary: "flee", priority: "high", activities: [], }),
      reflectionStepInterval: 4,
      today: "2026-09-25",
    },);

    expect(result.revisionsEmitted,).toBe(1,);
    expect(result.decisionEvents,).toEqual([{ actorId: "actor1", actionType: "bdi:priority_shift", },],);
    const rev = raw.query("SELECT * FROM actor_plan_revisions WHERE plan_id=?",).get(planId,) as Record<
      string,
      unknown
    >;

    expect(rev.before_priority,).toBe("normal",);
    expect(rev.after_priority,).toBe("high",);
    const row = raw.query("SELECT reflection_step_count FROM actor_daily_plans WHERE id=?",).get(planId,) as {
      reflection_step_count: number;
    };

    expect(row.reflection_step_count,).toBe(0,);
  });

  test("below interval with shifted priority → legacy shift-only checkpoint still fires", async () => {
    await seedPlan("actor1", "normal", 1,);
    const result = await runNightlyReflectionCycle(db, ["actor1",], {
      budgetApprove: async () => true,
      planRecompute: async () => ({ summary: "flee", priority: "high", activities: [], }),
      reflectionStepInterval: 4,
      today: "2026-09-25",
    },);

    expect(result.revisionsEmitted,).toBe(1,);
  });

  test("new plan creation records a bdi:plan_created decision event", async () => {
    const result = await runNightlyReflectionCycle(db, ["fresh",], {
      budgetApprove: async () => true,
      planRecompute: async () => ({ summary: "hunt", priority: "high", activities: [], }),
    },);

    expect(result.decisionEvents,).toEqual([{ actorId: "fresh", actionType: "bdi:plan_created", },],);
  });
});

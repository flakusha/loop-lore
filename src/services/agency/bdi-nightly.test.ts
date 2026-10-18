// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Database, } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Kysely, } from "kysely";
import type { DB, } from "../../db";
import { createInMemoryDb, } from "./__helpers/in-mem-db";
import { recordChatTurn, runNightlyReflectionCycle, } from "./bdi-nightly";
import { sanitizeDailyPlan, } from "./bdi-plan-shape";

let db: Kysely<DB>;
let raw: Database;

beforeEach(async () => {
  ({ db, raw, } = await createInMemoryDb());
},);

afterEach(() => {
  raw.close();
},);

describe("runNightlyReflectionCycle — first-night creation", () => {
  test("no existing plan → insert new with activities", async () => {
    const result = await runNightlyReflectionCycle(db, ["actor1",], {
      budgetApprove: async () => true,
      planRecompute: async () => ({
        summary: "hunt the dragon",
        priority: "high",
        activities: [
          { description: "scout", score: 0.8, },
          { description: "gather", score: 0.5, },
        ],
      }),
    },);

    expect(result.processed,).toBe(1,);
    expect(result.revisionsEmitted,).toBe(0,);
    const rows = raw.query("SELECT * FROM actor_daily_plans WHERE actor_id='actor1'",).all() as Array<
      Record<string, unknown>
    >;

    expect(rows.length,).toBe(1,);
    expect(rows[0]!.priority,).toBe("high",);
    const acts = raw.query("SELECT * FROM actor_planned_activities",).all() as Array<Record<string, unknown>>;
    expect(acts.length,).toBe(2,);
  });

  test("plan row carries the actor's real world, not its own id", async () => {
    // `actorWorldId` used to read the `actors` table and return `actorId`,
    // so every plan the cycle created recorded the actor's own id in
    // actor_daily_plans.world_id. The actor row below is what made the old
    // lookup succeed — and return the wrong value.
    raw.exec(`INSERT INTO users(id, username, display_name) VALUES ('u1', 'owner', 'Owner');`,);
    raw.exec(`INSERT INTO worlds(id, owner_id, name) VALUES ('world-7', 'u1', 'W');`,);
    raw.exec(`INSERT INTO actors(id, display_name) VALUES ('actor1', 'A');`,);
    raw.exec(`INSERT INTO world_members(world_id, actor_id) VALUES ('world-7', 'actor1');`,);

    await runNightlyReflectionCycle(db, ["actor1",], {
      budgetApprove: async () => true,
      planRecompute: async () => ({ summary: "rest", priority: "low", activities: [], }),
    },);

    const row = raw.query("SELECT world_id FROM actor_daily_plans WHERE actor_id='actor1'",).get() as {
      world_id: string | null;
    } | null;

    expect(row?.world_id,).toBe("world-7",);
  });

  test("an actor in no world plans with a null world", async () => {
    await runNightlyReflectionCycle(db, ["loner",], {
      budgetApprove: async () => true,
      planRecompute: async () => ({ summary: "wander", priority: "normal", activities: [], }),
    },);

    const row = raw.query("SELECT world_id FROM actor_daily_plans WHERE actor_id='loner'",).get() as {
      world_id: string | null;
    } | null;

    expect(row?.world_id,).toBeNull();
  });
});

describe("runNightlyReflectionCycle — same priority → no revision", () => {
  test("recompute matches existing → zero revisions", async () => {
    raw.exec(
      `INSERT INTO actor_daily_plans(id, actor_id, plan_date, summary, priority, created_at) VALUES ('plan1', 'actor1', '2026-09-25', 'old', 'normal', datetime('now'));`,
    );

    const result = await runNightlyReflectionCycle(db, ["actor1",], {
      budgetApprove: async () => true,
      planRecompute: async () => ({ summary: "new", priority: "normal", activities: [], }),
      today: "2026-09-25",
    },);

    expect(result.processed,).toBe(1,);
    expect(result.revisionsEmitted,).toBe(0,);
    const revs = raw.query("SELECT * FROM actor_plan_revisions",).all();
    expect(revs.length,).toBe(0,);
  });
});

describe("runNightlyReflectionCycle — priority shift emits revision", () => {
  test("priority changes → one revision row", async () => {
    raw.exec(
      `INSERT INTO actor_daily_plans(id, actor_id, plan_date, summary, priority, created_at) VALUES ('plan1', 'actor1', '2026-09-25', 'old', 'normal', datetime('now'));`,
    );

    const result = await runNightlyReflectionCycle(db, ["actor1",], {
      budgetApprove: async () => true,
      planRecompute: async () => ({ summary: "new", priority: "high", activities: [], }),
      today: "2026-09-25",
    },);

    expect(result.processed,).toBe(1,);
    expect(result.revisionsEmitted,).toBe(1,);
    const rev = raw.query("SELECT * FROM actor_plan_revisions WHERE plan_id='plan1'",).get() as Record<string, unknown>;
    expect(rev.before_priority,).toBe("normal",);
    expect(rev.after_priority,).toBe("high",);
  });
});

describe("runNightlyReflectionCycle — budget-exceeded skip", () => {
  test("budget denies → skip silently", async () => {
    const result = await runNightlyReflectionCycle(db, ["actor1", "actor2",], {
      budgetApprove: async (id,) => id !== "actor2", // only actor1 allowed
      planRecompute: async () => ({ summary: "x", priority: "high", activities: [], }),
    },);

    expect(result.processed,).toBe(1,);
    expect(result.skippedBudget,).toBe(1,);
    const plans = raw.query("SELECT * FROM actor_daily_plans",).all();
    expect(plans.length,).toBe(1,);
  });
});

describe("runNightlyReflectionCycle — injected-seam hardening", () => {
  test("garbage plan (empty summary, unknown priority) is rejected, not persisted", async () => {
    const result = await runNightlyReflectionCycle(db, ["actor1",], {
      budgetApprove: async () => true,
      planRecompute: async () => ({ summary: "", priority: "bogus-tier", activities: [], }),
    },);

    expect(result.processed,).toBe(0,);
    expect(result.failed,).toBe(1,);
    expect(result.decisionEvents,).toEqual([],);
    expect(raw.query("SELECT * FROM actor_daily_plans",).all().length,).toBe(0,);
    expect(raw.query("SELECT * FROM actor_planned_activities",).all().length,).toBe(0,);
  });

  test("well-typed but oversized plan is clamped before insert", async () => {
    const activities = Array.from({ length: 8, }, (_, i,) => ({ description: `act-${i}`, score: i * 20, }),);
    const result = await runNightlyReflectionCycle(db, ["actor1",], {
      budgetApprove: async () => true,
      planRecompute: async () => ({ summary: "x".repeat(600,), priority: "high", activities, }),
    },);

    expect(result.processed,).toBe(1,);
    expect(result.failed,).toBe(0,);
    const plan = raw.query("SELECT * FROM actor_daily_plans",).get() as { summary: string };
    expect(plan.summary,).toHaveLength(500,);
    const acts = raw.query("SELECT * FROM actor_planned_activities",).all() as unknown[];
    expect(acts.length,).toBe(5,);
  });

  test("a mid-loop throw is isolated: later actors still get their plans", async () => {
    const result = await runNightlyReflectionCycle(db, ["boom", "steady",], {
      budgetApprove: async () => true,
      planRecompute: async (id,) => {
        if (id === "boom") { throw new Error("generator exploded",); }
        return { summary: "fine", priority: "normal", activities: [], };
      },
    },);

    expect(result.processed,).toBe(1,);
    expect(result.failed,).toBe(1,);
    const rows = raw.query("SELECT actor_id FROM actor_daily_plans",).all() as Array<{
      actor_id: string;
    }>;

    expect(rows.map((r,) => r.actor_id),).toEqual(["steady",],);
  });

  test("garbage priority never emits a bogus revision against an existing plan", async () => {
    raw.exec(
      `INSERT INTO actor_daily_plans(id, actor_id, plan_date, summary, priority, created_at) VALUES ('plan1', 'actor1', '2026-09-25', 'old', 'normal', datetime('now'));`,
    );

    const result = await runNightlyReflectionCycle(db, ["actor1",], {
      budgetApprove: async () => true,
      planRecompute: async () => ({ summary: "new", priority: "bogus-tier", activities: [], }),
      today: "2026-09-25",
    },);

    expect(result.revisionsEmitted,).toBe(0,);
    expect(raw.query("SELECT * FROM actor_plan_revisions",).all().length,).toBe(0,);
  });
});

describe("recordChatTurn — cooldown + consecutive cap", () => {
  test("first chat creates buffer; second immediate chat blocked", async () => {
    const now = new Date("2026-09-25T12:00:00Z",);
    const first = await recordChatTurn(db, "a1", "a2", now,);
    expect(first.allowed,).toBe(true,);

    const second = await recordChatTurn(db, "a1", "a2", new Date("2026-09-25T12:05:00Z",),);
    expect(second.allowed,).toBe(false,);
    expect(second.reason,).toBe("cooldown_active",);
    expect(second.cooldownRemainingMs,).toBeGreaterThan(0,);
  });

  test("after cooldown elapses, chat proceeds", async () => {
    const t0 = new Date("2026-09-25T12:00:00Z",);
    await recordChatTurn(db, "a1", "a2", t0,);
    const later = new Date(t0.getTime() + 16 * 60_000,);
    const second = await recordChatTurn(db, "a1", "a2", later,);
    expect(second.allowed,).toBe(true,);
  });

  test("consecutive cap trips when at limit", async () => {
    const t0 = new Date("2026-09-25T12:00:00Z",);
    await recordChatTurn(db, "a1", "a2", t0,);
    // Step 17 min apart: > cooldown (15) so each chat passes cooldown,
    // < cooldown*2 (30) so count keeps incrementing without reset.
    // 17 is the smallest interval that hits the cap exactly at the 4th chat.
    for (let i = 1; i <= 2; i++) {
      const next = new Date(t0.getTime() + i * 17 * 60_000,);
      const r = await recordChatTurn(db, "a1", "a2", next,);
      expect(r.allowed,).toBe(true,);
    }

    const blocked = await recordChatTurn(db, "a1", "a2", new Date(t0.getTime() + 3 * 17 * 60_000,),);
    expect(blocked.allowed,).toBe(false,);
    expect(blocked.reason,).toBe("consecutive_cap",);
  });

  test("different partner chats are independent", async () => {
    const t0 = new Date("2026-09-25T12:00:00Z",);
    await recordChatTurn(db, "a1", "a2", t0,);
    const toOther = await recordChatTurn(db, "a1", "a3", t0,);
    expect(toOther.allowed,).toBe(true,);
  });
});

describe("sanitizeDailyPlan — injected-seam plan validation", () => {
  test("rejects non-plans: null, primitives, blank summary, unknown priority, non-array activities", () => {
    expect(sanitizeDailyPlan(null,),).toBeNull();
    expect(sanitizeDailyPlan("high",),).toBeNull();
    expect(sanitizeDailyPlan({ summary: "   ", priority: "high", activities: [], },),).toBeNull();
    expect(sanitizeDailyPlan({ summary: "ok", priority: "bogus-tier", activities: [], },),).toBeNull();
    expect(sanitizeDailyPlan({ summary: "ok", priority: "high", activities: "nope", },),).toBeNull();
  });

  test("accepts the four vocabulary priorities, case-insensitively", () => {
    for (const priority of ["low", "normal", "high", "critical",]) {
      expect(sanitizeDailyPlan({ summary: "s", priority, activities: [], },)?.priority,).toBe(priority,);
    }

    expect(sanitizeDailyPlan({ summary: "s", priority: " HIGH ", activities: [], },)?.priority,).toBe("high",);
  });

  test("clamps summary length, activity count, and scores", () => {
    const plan = sanitizeDailyPlan({
      summary: "x".repeat(600,),
      priority: "normal",
      activities: [
        ...Array.from({ length: 7, }, (_, i,) => ({ description: `a${i}`, score: i * 25, }),),
        { description: "fine", score: Number.NaN, },
        { description: "  ", score: 1, },
      ],
    },);

    expect(plan?.summary,).toHaveLength(500,);
    expect(plan?.activities,).toHaveLength(5,);
    expect(plan?.activities.map((a,) => a.score),).toEqual([0, 25, 50, 75, 100,],);
  });
});

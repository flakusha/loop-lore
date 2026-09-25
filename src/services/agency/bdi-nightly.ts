// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * BDI-lite nightly reflection cycle.
 *
 * Per-actor, once per night, recompute the `DailyPlan` and emit
 * `PlanRevision` rows when reflection shifts priorities. Cost-bounded
 * by the configured budget; deficit returns silently.
 *
 * ponytail: bdi-nightly runs sequential per-actor; parallelise after
 * cost governor supports per-actor budgets.
 *
 * @module services/agency/bdi-nightly
 */

import { type Kysely, sql, } from "kysely";
import type { DB, } from "../../db";
import { createLogger, getLogger, } from "../../logger";
import { applyReflectionCheckpoint, } from "./bdi-reflection";

// Lazy logger init — module body must not throw if the global logger
// has not been initialized yet (e.g. direct module import in tests).
try { getLogger(); } catch { createLogger({ level: "error", },); }
const log = getLogger().child({ module: "agency/bdi-nightly", },);

/** Cost-aware plan generator. Caller injects (default: deterministic stub). */
export type PlanRecomputeFn = (actorId: string, worldId: string | undefined, today: string,) => Promise<{
  summary: string;
  priority: string;
  activities: Array<{ description: string; score: number; }>;
}>;

/** Cost governor decision. Returns true if the actor may proceed tonight. */
export type BudgetApproveFn = (actorId: string,) => Promise<boolean>;

export interface NightlyOptions {
  budgetApprove: BudgetApproveFn;
  planRecompute: PlanRecomputeFn;
  /** Stop after this many actors (defensive default: 100). */
  maxActors?: number;
  /** ISO YYYY-MM-DD override (defaults to today UTC). Tests inject to avoid wall-clock skew. */
  today?: string;
}

export interface NightlyResult {
  processed: number;
  skippedBudget: number;
  revisionsEmitted: number;
}

const DEFAULT_PRIORITY = "normal";

/**
 * Run the nightly cycle. Sequential per-actor; parallelise after the
 * cost governor supports per-actor budgets (ponytail note above).
 * @param db
 * @param actorIds
 * @param opts
 */
export async function runNightlyReflectionCycle(
  db: Kysely<DB>,
  actorIds: readonly string[],
  opts: NightlyOptions,
): Promise<NightlyResult> {
  const limit = opts.maxActors ?? 100;
  const target = actorIds.slice(0, limit,);
  const today = opts.today ?? todayIso();
  const summary = { processed: 0, skippedBudget: 0, revisionsEmitted: 0, };

  for (const actorId of target) {
    const allowed = await opts.budgetApprove(actorId,);
    if (!allowed) { summary.skippedBudget += 1; continue; }

    const prevPlan = await db
      .selectFrom("actor_daily_plans",)
      .selectAll()
      .where("actor_id", "=", actorId,)
      .where("plan_date", "=", today,)
      .executeTakeFirst();

    const worldId = await actorWorldId(db, actorId,);
    const next = await opts.planRecompute(actorId, worldId ?? undefined, today,);

    if (!prevPlan) {
      await insertPlan(db, actorId, worldId, today, next,);
    } else if (prevPlan.priority !== next.priority) {
      await applyReflectionCheckpoint(db, prevPlan.id, {
        revision_kind: "priority_shift",
        before: prevPlan.priority,
        after: next.priority,
        reason: "nightly reflection",
      },);
      summary.revisionsEmitted += 1;
    }

    summary.processed += 1;
  }

  log.info("bdi-nightly complete", summary,);
  return summary;
}

async function insertPlan(
  db: Kysely<DB>,
  actorId: string,
  worldId: string | null,
  today: string,
  next: { summary: string; priority: string; activities: Array<{ description: string; score: number; }>; },
): Promise<void> {
  const planId = await newId(db,);
  await db
    .insertInto("actor_daily_plans",)
    .values({
      id: planId,
      actor_id: actorId,
      world_id: worldId ?? null,
      plan_date: today,
      summary: next.summary,
      priority: next.priority ?? DEFAULT_PRIORITY,
      created_at: sql`datetime('now')`,
    },)
    .execute();
  for (const a of next.activities) {
    await db
      .insertInto("actor_planned_activities",)
      .values({
        id: await newId(db,),
        plan_id: planId,
        description: a.description,
        score: a.score,
        completed: 0,
        created_at: sql`datetime('now')`,
      },)
      .execute();
  }
}

async function newId(db: Kysely<DB>,): Promise<string> {
  const row = await sql<{ id: string }>`SELECT lower(hex(randomblob(16))) AS id`.execute(db,);
  return row.rows[0]!.id;
}

async function actorWorldId(db: Kysely<DB>, actorId: string,): Promise<string | null> {
  const row = await db
    .selectFrom("actors",)
    .select("id",)
    .where("id", "=", actorId,)
    .executeTakeFirst();
  return row ? actorId : null;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0",)}-${String(d.getUTCDate()).padStart(2, "0",)}`;
}

/**
 * Update the chat-buffer last_chat_at / consecutive_count for an actor pair.
 * Enforces cooldown and consecutive chat cap in app; consults the row to
 * decide whether the next chat is allowed.
 *
 * Returns `{ allowed: true, buffer }` when the next chat proceeds; otherwise
 * `{ allowed: false, reason }`.
 */
export async function recordChatTurn(
  db: Kysely<DB>,
  actorId: string,
  partnerActorId: string,
  now: Date = new Date(),
): Promise<{ allowed: boolean; reason?: string; cooldownRemainingMs?: number; }> {
  const existing = await db
    .selectFrom("actor_chat_buffers",)
    .selectAll()
    .where("actor_id", "=", actorId,)
    .where("partner_actor_id", "=", partnerActorId,)
    .executeTakeFirst();
  if (!existing) {
    const id = await newId(db,);
    await db
      .insertInto("actor_chat_buffers",)
      .values({
        id,
        actor_id: actorId,
        partner_actor_id: partnerActorId,
        last_chat_at: now.toISOString(),
        consecutive_count: 1,
        cooldown_minutes: 15,
        max_consecutive_chats: 3,
      },)
      .execute();
    return { allowed: true, };
  }

  const last = new Date(existing.last_chat_at,).getTime();
  const elapsedMin = (now.getTime() - last,) / 60_000;
  if (elapsedMin < existing.cooldown_minutes) {
    return {
      allowed: false,
      reason: "cooldown_active",
      cooldownRemainingMs: (existing.cooldown_minutes - elapsedMin,) * 60_000,
    };
  }
  if (existing.consecutive_count >= existing.max_consecutive_chats && elapsedMin < existing.cooldown_minutes * 2) {
    return { allowed: false, reason: "consecutive_cap", };
  }
  const nextCount = elapsedMin >= existing.cooldown_minutes * 2 ? 1 : existing.consecutive_count + 1;
  await db
    .updateTable("actor_chat_buffers",)
    .set({ last_chat_at: now.toISOString(), consecutive_count: nextCount, },)
    .where("id", "=", existing.id,)
    .execute();
  return { allowed: true, };
}

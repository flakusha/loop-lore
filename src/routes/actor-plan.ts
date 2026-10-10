// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Actor plan JSON endpoint (TASK-agency-bdi-reflection-cycle AC):
 *   GET /api/v1/actors/:actorId/plan — the actor's current daily plan
 *   from `actor_daily_plans` (latest by plan_date) with its planned
 *   activities.
 *
 * Opt-in and off by default: the endpoint 404s unless
 * `actors.plan_visible = 1` for the actor. The same 404 covers the
 * not-opted-in, foreign-owner, and nonexistent-actor cases so the route
 * does not leak which actors exist.
 *
 * @module routes/actor-plan
 */

import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { jsonResponse, notFoundResponse, requireUserId, } from "./http-utils";

/**
 * @param opts
 * @param opts.database
 * @param prefix
 */
export function actorPlanRoutes({ database, }: { database: Kysely<DB> }, prefix = "/api",) {
  return new Elysia({ name: "actor-plan", },)
    .get(
      `${prefix}/actors/:actorId/plan`,
      async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (userId instanceof Response) { return userId; }

        const actorId = ctx.params.actorId;
        const actor = await database
          .selectFrom("actors",)
          .select(["id", "owner_id", "user_id", "plan_visible", "display_name",],)
          .where("id", "=", actorId,)
          .executeTakeFirst();

        // One 404 for missing / foreign / not-opted-in: existence of an
        // invisible plan is not something the route confirms.
        if (!actor || actor.plan_visible !== 1 || (actor.owner_id !== userId && actor.user_id !== userId)) {
          return notFoundResponse();
        }

        const plan = await database
          .selectFrom("actor_daily_plans",)
          .selectAll()
          .where("actor_id", "=", actorId,)
          .orderBy("plan_date", "desc",)
          .executeTakeFirst();

        if (!plan) {
          return jsonResponse({ actor_id: actorId, actor_name: actor.display_name, plan: null, },);
        }

        const activities = await database
          .selectFrom("actor_planned_activities",)
          .select(["id", "description", "score", "completed",],)
          .where("plan_id", "=", plan.id,)
          .orderBy("created_at", "asc",)
          .execute();

        return jsonResponse({
          actor_id: actorId,
          actor_name: actor.display_name,
          plan: {
            id: plan.id,
            plan_date: plan.plan_date,
            summary: plan.summary,
            priority: plan.priority,
            activities: activities.map((a,) => ({
              id: a.id,
              description: a.description,
              score: a.score,
              completed: a.completed === 1,
            })),
          },
        },);
      },
      {
        response: {
          200: t.Object({
            actor_id: t.String(),
            actor_name: t.String(),
            plan: t.Union([
              t.Null(),
              t.Object({
                id: t.String(),
                plan_date: t.String(),
                summary: t.String(),
                priority: t.String(),
                activities: t.Array(t.Object({
                  id: t.String(),
                  description: t.String(),
                  score: t.Number(),
                  completed: t.Boolean(),
                },),),
              },),
            ],),
          },),
        },
      },
    );
}

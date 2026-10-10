// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 051_bdi_reflection_cadence_and_plan_visibility
 *
 * Completes TASK-agency-bdi-reflection-cycle leftovers:
 *   - `actor_daily_plans.reflection_step_count` — steps since the last
 *     reflection checkpoint for this plan. The BDI dispatch increments it
 *     once per beat tick and fires `applyReflectionCheckpoint` every
 *     `bdiReflectionStepInterval` steps (0 = nightly-only, unchanged).
 *   - `actors.plan_visible` — player opt-in for the plan JSON endpoint.
 *     Off by default; the endpoint 404s unless this is 1.
 *   - `interaction_logs.action_type` — decision telemetry feed
 *     (`utility:<kind>` / `bdi:<step>`), alongside the existing
 *     `agency_mode` column from migration 009.
 *
 * Append-only: three independent ADD COLUMN alters (SQLite allows one
 * per alterTable statement).
 */
import { type Kysely, } from "kysely";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("actor_daily_plans",)
    .addColumn("reflection_step_count", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await database.schema
    .alterTable("actors",)
    .addColumn("plan_visible", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await database.schema
    .alterTable("interaction_logs",)
    .addColumn("action_type", "text",)
    .execute();
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("interaction_logs",)
    .dropColumn("action_type",)
    .execute();

  await database.schema
    .alterTable("actors",)
    .dropColumn("plan_visible",)
    .execute();

  await database.schema
    .alterTable("actor_daily_plans",)
    .dropColumn("reflection_step_count",)
    .execute();
}

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Generation Delivery Columns — stop-and-respond interrupt semantics
 *
 * Adds columns needed for the always-available Stop button to:
 * - record the last SSE event index the client actually received
 *   (`last_rendered_chunk_index` — StreamBuffer sequence number) so the
 *   server can tell the response from "what the user saw" vs. "what the
 *   model was mid-producing".
 * - record when the full response was confirmed delivered
 *   (`delivery_confirmed_at` — ISO timestamp). Telemetry/billing hooks
 *   MUST skip recording `generation.completed` token usage when this is
 *   NULL, so undelivered output is never charged.
 * - flag whether fan-out cancellation of side-effect jobs (TTS / image
 *   queue) ran to completion
 *   (`side_effect_jobs_cancelled` — 0/1 boolean).
 *
 * See TASK-stop-and-respond-interrupt-semantics.md.
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";

/**
 * @param db
 */
export async function up(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .alterTable("generation_attempts",)
    .addColumn("last_rendered_chunk_index", "integer",)
    .execute();

  await db.schema
    .alterTable("generation_attempts",)
    .addColumn("delivery_confirmed_at", "text",)
    .execute();

  await db.schema
    .alterTable("generation_attempts",)
    .addColumn("side_effect_jobs_cancelled", "integer", (col,) => col.defaultTo(sql`(0)`,),)
    .execute();
}

/**
 * @param db
 */
export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .alterTable("generation_attempts",)
    .dropColumn("side_effect_jobs_cancelled",)
    .execute();

  await db.schema
    .alterTable("generation_attempts",)
    .dropColumn("delivery_confirmed_at",)
    .execute();

  await db.schema
    .alterTable("generation_attempts",)
    .dropColumn("last_rendered_chunk_index",)
    .execute();
}

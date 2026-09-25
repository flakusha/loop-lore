// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 009_interaction_log_agency_mode
 *
 * Adds `agency_mode` text-enum column to `interaction_logs` per
 * `TASK-agency-quality-metrics`. Backfill is automatic (DEFAULT 'free'
 * covers existing rows).
 *
 * One ALTER (SQLite limitation: at most one ADD COLUMN per alterTable call).
 */
import { type Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("interaction_logs",)
    .addColumn("agency_mode", "text", (col,) => col.notNull().defaultTo("free",),)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("interaction_logs",)
    .dropColumn("agency_mode",)
    .execute();
}

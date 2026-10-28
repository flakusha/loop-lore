// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 081_assistant_quota_usage
 *
 * Persistent per-user fixed-window quota counters for assistant
 * entity-access commands (epic-assistant-entity-access wrap-up). One row per
 * user: `window_start` (epoch ms, as text) anchors the current fixed window
 * and `used_units` accumulates deducted costs. The atomic check-and-deduct
 * statement lives in `src/assistant/quota/db-storage.ts`; the in-process
 * store remains the fallback when no DB handle is available (unit tests).
 */
import type { Kysely, } from "kysely";

/** Create the assistant_quota_usage table. */
export async function up(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .createTable("assistant_quota_usage",)
    .addColumn("user_id", "text", (col,) => col.primaryKey(),)
    .addColumn("window_start", "text", (col,) => col.notNull(),)
    .addColumn("used_units", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();
}

/** Drop the assistant_quota_usage table. */
export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema.dropTable("assistant_quota_usage",).execute();
}

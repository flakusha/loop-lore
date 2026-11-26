// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 015_honeypot_classification — local-only decoy hit labels.
 * Append-only after the consolidated baseline. No enforcement: rows feed
 * logs and later intel slices, never a block decision.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("honeypot_indicators",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("indicator", "text", (col,) => col.notNull(),)
    .addColumn("label", "text", (col,) => col.notNull(),)
    .addColumn("confidence", "real", (col,) => col.notNull(),)
    .addColumn("source", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("expires_at", "text", (col,) => col.notNull(),)
    .execute();

  await sql`CREATE INDEX "idx_honeypot_indicators_indicator_expires" on "honeypot_indicators" ("indicator", "expires_at")`
    .execute(database,);

  await sql`CREATE INDEX "idx_honeypot_indicators_expiry" on "honeypot_indicators" ("expires_at")`
    .execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("honeypot_indicators",).execute();
}

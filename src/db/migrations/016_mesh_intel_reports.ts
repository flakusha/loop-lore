// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 016_mesh_intel_reports — advisory peer reports from the mesh intel feed.
 * Append-only after the consolidated baseline. No enforcement surface:
 * rows are scoped to the reporting peer, expire by TTL, and are delistable.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("mesh_intel_reports",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("indicator", "text", (col,) => col.notNull(),)
    .addColumn("type", "text", (col,) => col.notNull(),)
    .addColumn("confidence", "real", (col,) => col.notNull(),)
    .addColumn("source_peer", "text", (col,) => col.notNull(),)
    .addColumn("action", "text", (col,) => col.notNull(),)
    .addColumn("nonce", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("expires_at", "text", (col,) => col.notNull(),)
    .addColumn("received_at", "text", (col,) => col.notNull(),)
    .execute();

  // Nonce is a peer-chosen replay key: uniqueness must be peer-scoped so one
  // peer cannot squat another peer\x27s nonce and suppress its report.
  await sql`CREATE UNIQUE INDEX "idx_mesh_intel_reports_nonce" on "mesh_intel_reports" ("source_peer", "nonce")`
    .execute(database,);

  await sql`CREATE INDEX "idx_mesh_intel_reports_lookup" on "mesh_intel_reports" ("indicator", "source_peer", "expires_at")`
    .execute(database,);

  await sql`CREATE INDEX "idx_mesh_intel_reports_expiry" on "mesh_intel_reports" ("expires_at")`
    .execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("mesh_intel_reports",).execute();
}

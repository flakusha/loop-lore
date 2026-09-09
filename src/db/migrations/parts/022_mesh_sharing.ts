// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Mesh content sharing tables (Phase 2: encrypted sharing + reservation).
 *
 * mesh_reservations — capacity intent on the SENDING side: reserve before
 * push, confirm on delivery ack, release on failure, expire on timeout.
 * mesh_deliveries — RECEIVED content record for LWW conflict resolution:
 * one row per content id, highest (clock, hash) wins.
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";
import { recordSchemaVersion, } from "../../schema-version";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("mesh_reservations",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("peer_origin", "text", (col,) => col.notNull().references("mesh_peers.origin",).onDelete("cascade",),)
    .addColumn("content_hash", "text", (col,) => col.notNull(),)
    .addColumn("size_bytes", "integer", (col,) => col.notNull(),)
    .addColumn("content_type", "text", (col,) => col.notNull().defaultTo("blob",),)
    .addColumn("state", "text", (col,) => col.notNull().defaultTo("reserved",),)
    .addColumn("expires_at", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();
  await database.schema
    .createTable("mesh_deliveries",)
    .addColumn("content_id", "text", (col,) => col.primaryKey(),)
    .addColumn("origin", "text", (col,) => col.notNull(),)
    .addColumn("content_hash", "text", (col,) => col.notNull(),)
    .addColumn("clock", "integer", (col,) => col.notNull(),)
    .addColumn("received_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();
  await recordSchemaVersion(database, 22, "mesh sharing reservations and deliveries",);
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("mesh_deliveries",).execute();
  await database.schema.dropTable("mesh_reservations",).execute();
}

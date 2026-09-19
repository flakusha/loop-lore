// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Mesh per-sender inbound content keys (Phase 3: zero-PSK payloads).
 *
 * `mesh_inbound_keys` holds this instance's inbound content key per
 * trusted sender, SMK-encrypted at rest. The receiver mints the key at
 * reserve time, hands it to the sender in the reservation response, and
 * tries it first at delivery (current → grace previous → PSK fallback).
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";
import { recordSchemaVersion, removeSchemaVersion, } from "../schema-version";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("mesh_inbound_keys",)
    .addColumn("peer_origin", "text", (col,) => col.primaryKey(),)
    .addColumn("encrypted_key", "text", (col,) => col.notNull(),)
    .addColumn("previous_encrypted_key", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();
  await recordSchemaVersion(database, 24, "mesh per-sender inbound keys",);
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("mesh_inbound_keys",).execute();
  await removeSchemaVersion(database, 24,);
}

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 036_mesh_dek_exports
 *
 * Sender-side audit log for federation DEK re-wrap exports
 * (TASK-federation-dek-re-wrap-protocol): one row per chat-DEK export to
 * a peer. The wrapped key material itself is NOT stored — this is an audit
 * record of which chat key version went to which peer, when, and whether
 * the export has since been revoked. No FKs by design: audit rows survive
 * chat/peer deletion; a peer removal marks its exports revoked via
 * revokeDekExportsForPeer (src/federation/dek-rewrap.ts), and crypto death
 * comes from the peer rotating/revoking its inbound key (peer-keys.ts).
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("mesh_dek_exports",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("chat_id", "text", (col,) => col.notNull(),)
    .addColumn("key_id", "text", (col,) => col.notNull(),)
    .addColumn("peer_origin", "text", (col,) => col.notNull(),)
    .addColumn("sender_origin", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("revoked_at", "text",)
    .execute();

  await database.schema
    .createIndex("idx_mesh_dek_exports_peer",)
    .on("mesh_dek_exports",)
    .column("peer_origin",)
    .execute();

  await database.schema
    .createIndex("idx_mesh_dek_exports_chat",)
    .on("mesh_dek_exports",)
    .column("chat_id",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("idx_mesh_dek_exports_chat",).execute();
  await database.schema.dropIndex("idx_mesh_dek_exports_peer",).execute();
  await database.schema.dropTable("mesh_dek_exports",).execute();
}

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Mesh peer inbound capacity (Phase 2.5: reservation quota).
 *
 * Adds `mesh_peers.capacity_bytes` — max aggregate reserved bytes per peer
 * (NULL = unlimited). Enforced at reservation time; existing rows keep
 * NULL (unlimited) so the upgrade is behavior-preserving.
 */
import type { Kysely, } from "kysely";
import { recordSchemaVersion, removeSchemaVersion, } from "../schema-version";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("mesh_peers",)
    .addColumn("capacity_bytes", "integer",)
    .execute();
  await recordSchemaVersion(database, 23, "mesh peer inbound capacity",);
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.alterTable("mesh_peers",).dropColumn("capacity_bytes",).execute();
  await removeSchemaVersion(database, 23,);
}

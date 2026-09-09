// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Mesh peer inbound capacity (Phase 2: coordinator-mediated reservation).
 *
 * `mesh_peers.capacity_bytes` caps the total plaintext bytes a peer accepts
 * via inbound reservations (reserved + pushed states). NULL means unlimited.
 * Reservations record intent against this allowance; the quota ticket owns
 * dynamic/negotiated limits later.
 */
import type { Kysely, } from "kysely";
import { recordSchemaVersion, } from "../schema-version";

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
}

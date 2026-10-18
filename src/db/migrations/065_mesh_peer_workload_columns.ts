// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 065_mesh_peer_workload_columns
 *
 * Workload metadata on the EXISTING peer registry (no second peer table):
 * `display_name`, `instance_kind`, `auth_mode`, `workload_trust`,
 * `allowed_workload_classes`, `sticky_enabled` and the encrypted same-host
 * workload token `shared_token_enc`.
 *
 * `workload_trust` and `sticky_enabled` are orthogonal intrinsic flags, not
 * lifecycle state (the banned-patterns exception for singular toggles), so
 * integer 0/1 is the correct shape; the lifecycle axis stays `state`.
 *
 * `link_kind` is deliberately absent: it is derived from the origin host at
 * load time and a stored copy could drift from the URL.
 *
 * One column per `alterTable` statement — SQLite cannot do multi-column ALTER.
 */
import { type Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema.alterTable("mesh_peers",).addColumn("display_name", "text",).execute();
  await database.schema
    .alterTable("mesh_peers",)
    .addColumn("instance_kind", "text", (col,) => col.notNull().defaultTo("general",),)
    .execute();

  await database.schema
    .alterTable("mesh_peers",)
    .addColumn("auth_mode", "text", (col,) => col.notNull().defaultTo("tls",),)
    .execute();

  await database.schema
    .alterTable("mesh_peers",)
    .addColumn("workload_trust", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await database.schema
    .alterTable("mesh_peers",)
    .addColumn("allowed_workload_classes", "text", (col,) => col.notNull().defaultTo("[]",),)
    .execute();

  await database.schema
    .alterTable("mesh_peers",)
    .addColumn("sticky_enabled", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await database.schema
    .alterTable("mesh_peers",)
    .addColumn("shared_token_enc", "text",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.alterTable("mesh_peers",).dropColumn("shared_token_enc",).execute();
  await database.schema.alterTable("mesh_peers",).dropColumn("sticky_enabled",).execute();
  await database.schema.alterTable("mesh_peers",).dropColumn("allowed_workload_classes",).execute();
  await database.schema.alterTable("mesh_peers",).dropColumn("workload_trust",).execute();
  await database.schema.alterTable("mesh_peers",).dropColumn("auth_mode",).execute();
  await database.schema.alterTable("mesh_peers",).dropColumn("instance_kind",).execute();
  await database.schema.alterTable("mesh_peers",).dropColumn("display_name",).execute();
}

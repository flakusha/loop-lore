// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/db/schema-backfill-mesh.ts — stranded guard for part 022 tables.
//
// Part 022 persists send-side reservations and received-delivery records;
// databases frozen before 022 lack both tables. Detection is
// `sqlite_master`; the repair mirrors 022 exactly, including its
// schema-version record.
// @module schema-backfill-mesh

import type { Kysely, } from "kysely";
import { sql, } from "kysely";
import { getLogger, } from "../logger";
import type { DB, } from "./schema";
import { tableSql, } from "./schema-backfill";
import { recordSchemaVersion, } from "./schema-version";

/**
 * Create stranded mesh sharing tables.
 *
 * Part 022 persists send-side reservations and received-delivery records;
 * databases frozen before 022 lack both tables. Detection is
 * `sqlite_master`; the repair mirrors 022 exactly, including its
 * schema-version record.
 * @param database - Migrated database handle.
 * @returns True when a table was created, false when both present.
 */
export async function repairMeshSharing(database: Kysely<DB>,): Promise<boolean> {
  const hasReservations = (await tableSql(database, "mesh_reservations",)) !== null;
  const hasDeliveries = (await tableSql(database, "mesh_deliveries",)) !== null;
  if (hasReservations && hasDeliveries) { return false; }
  const log = getLogger().child({ module: "schema-backfill", },);
  if (!hasReservations) {
    await database.schema
      .createTable("mesh_reservations",)
      .addColumn("id", "text", (column,) => column.primaryKey(),)
      .addColumn(
        "peer_origin",
        "text",
        (column,) => column.notNull().references("mesh_peers.origin",).onDelete("cascade",),
      )
      .addColumn("content_hash", "text", (column,) => column.notNull(),)
      .addColumn("size_bytes", "integer", (column,) => column.notNull(),)
      .addColumn("content_type", "text", (column,) => column.notNull().defaultTo("blob",),)
      .addColumn("state", "text", (column,) => column.notNull().defaultTo("reserved",),)
      .addColumn("expires_at", "text", (column,) => column.notNull(),)
      .addColumn("created_at", "text", (column,) => column.notNull().defaultTo(sql`(datetime('now'))`,),)
      .execute();
  }
  if (!hasDeliveries) {
    await database.schema
      .createTable("mesh_deliveries",)
      .addColumn("content_id", "text", (column,) => column.primaryKey(),)
      .addColumn("origin", "text", (column,) => column.notNull(),)
      .addColumn("content_hash", "text", (column,) => column.notNull(),)
      .addColumn("clock", "integer", (column,) => column.notNull(),)
      .addColumn("received_at", "text", (column,) => column.notNull().defaultTo(sql`(datetime('now'))`,),)
      .execute();
  }
  if ((await tableSql(database, "schema_version",)) !== null) {
    await recordSchemaVersion(database, 22, "mesh sharing reservations and deliveries",);
  }
  log.info("Schema backfill applied: mesh sharing tables created",);
  return true;
}

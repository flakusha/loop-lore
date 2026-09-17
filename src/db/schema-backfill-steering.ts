// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/db/schema-backfill-steering.ts — stranded guard for folded part 003.
//
// Part 003 (folded) persists GM forward-event steerings (docs/spec/lore.md
// §5.3); databases frozen before the fold lack the table. Detection is
// `sqlite_master`; the repair mirrors 003 exactly, including the index and
// its schema-version record.
// @module schema-backfill-steering

import type { Kysely, } from "kysely";
import { sql, } from "kysely";
import { getLogger, } from "../logger";
import type { DB, } from "./schema";
import { tableSql, } from "./schema-backfill-queries";
import { recordSchemaVersion, } from "./schema-version";

/**
 * Create a stranded `world_event_steerings` table.
 * @param database - Migrated database handle.
 * @returns True when the table was created, false when already present.
 */
export async function repairEventSteerings(database: Kysely<DB>,): Promise<boolean> {
  if ((await tableSql(database, "world_event_steerings",)) !== null) { return false; }
  const log = getLogger().child({ module: "schema-backfill", },);
  await database.schema
    .createTable("world_event_steerings",)
    .addColumn("id", "text", (column,) => column.primaryKey(),)
    .addColumn("world_id", "text", (column,) => column.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("timeline_id", "text", (column,) => column.notNull().defaultTo("prime",),)
    .addColumn("description", "text", (column,) => column.notNull(),)
    .addColumn("manifest_probability", "real", (column,) => column.notNull().defaultTo(0.5,),)
    .addColumn("conditions", "text",)
    .addColumn("may_manifest", "integer", (column,) => column.notNull().defaultTo(1,),)
    .addColumn("status", "text", (column,) => column.notNull().defaultTo("pending",),)
    .addColumn("audience_scope", "text",)
    .addColumn("resolved_at", "text",)
    .addColumn("created_at", "text", (column,) => column.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();
  await database.schema
    .createIndex("idx_wes_world_status",)
    .on("world_event_steerings",)
    .columns(["world_id", "status",],)
    .execute();
  if ((await tableSql(database, "schema_version",)) !== null) {
    await recordSchemaVersion(database, 26, "world event steerings",);
  }
  log.info("Schema backfill applied: world_event_steerings created",);
  return true;
}

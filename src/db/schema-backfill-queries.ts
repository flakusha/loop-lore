// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Schema-backfill shared queries — leaf module.
 *
 * Owns tableSql (a tiny sqlite_master lookup) so the backfill
 * orchestrator (schema-backfill.ts) and the sub-tasks
 * (schema-backfill-mesh.ts, schema-backfill-steering.ts) can
 * both depend on it without forming a cycle.
 */

import { type Kysely, sql, } from "kysely";
import type { DB, } from "./schema";

/**
 * Return the CREATE TABLE statement stored in sqlite_master for
 * the given table name, or null when the table does not exist.
 * @param database
 * @param name
 */
export async function tableSql(database: Kysely<DB>, name: string,): Promise<string | null> {
  const found = await sql<{ sql: string | null }>`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ${name}`
    .execute(database,);
  return found.rows[0]?.sql ?? null;
}

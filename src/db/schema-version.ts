// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Queryable schema-version accessors (FEAT-040).
 *
 * The `schema_version` table (parts/018) holds one row per migration part.
 * These helpers are the app-code surface: health checks and admin routes
 * call `getSchemaVersion`, new migration parts call `recordSchemaVersion`.
 * @module schema-version
 */

import { type Kysely, sql, } from "kysely";

/**
 * Return the highest applied schema part number, or 0 when the
 * `schema_version` table does not exist yet (pre-018 database).
 * @param database - Queryable database handle.
 * @returns Max `version` in `schema_version`, or 0.
 * @example
 * const version = await getSchemaVersion(db);
 * // 18 on a fully migrated database
 */
export async function getSchemaVersion(database: Kysely<unknown>,): Promise<number> {
  try {
    const result = await sql<{ version: number | null }>`
      SELECT MAX(version) AS version FROM schema_version
    `.execute(database,);
    return result.rows[0]?.version ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Record one applied schema part. Idempotent — re-recording the same
 * version is a no-op. New migration parts call this from `up()`.
 * @param database - Writable database handle.
 * @param version - Parts/ number (e.g. 19).
 * @param description - Short human-readable label.
 * @example
 * await recordSchemaVersion(database, 19, "chat branches");
 */
export async function recordSchemaVersion(
  database: Kysely<unknown>,
  version: number,
  description: string,
): Promise<void> {
  await sql`INSERT OR IGNORE INTO schema_version (version, description)
    VALUES (${version}, ${description})`.execute(database,);
}

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * content_flags partial UNIQUE INDEX — closes the flagContent TOCTOU race.
 *
 * Pre-fix: flagContent() did SELECT (content_type, content_id, status IN
 * pending/under_review) then INSERT; two concurrent requests could both pass
 * the SELECT, both INSERT, leaving duplicate rows. Adding the partial unique
 * index on (content_type, content_id) WHERE status IN the open set makes
 * the second INSERT fail with UNIQUE violation, which the service maps to
 * "Content already flagged for review".
 *
 * Resolved/upheld flags are excluded so a re-flag after resolution is allowed.
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";
import { recordSchemaVersion, } from "../../schema-version";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await sql`
    CREATE UNIQUE INDEX content_flags_open_unique
    ON content_flags (content_type, content_id)
    WHERE status IN ('pending', 'under_review')
  `.execute(database,);
  await recordSchemaVersion(database, 23, "content_flags partial unique for open flag dedup",);
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await sql`DROP INDEX IF EXISTS content_flags_open_unique`.execute(database,);
}

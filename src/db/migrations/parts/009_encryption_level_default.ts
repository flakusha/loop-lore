// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { type Kysely, sql, } from "kysely";

/**
 * Fix chats.encryption_level default: was historically set to "public" but
 * "public" is not a valid EncryptionLevel value (none | standard | private).
 *
 * - Changes the column default from "public" → "none"
 * - Idempotent backfill: any row still carrying the historical "public" sentinel
 *   is updated to "none"
 *
 * Down migration is a no-op: the historical "public" default cannot be
 * restored deterministically after the backfill.
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  // Set the new default (future inserts will use "none")
  await database.schema
    .alterTable("chats",)
    .alterColumn("encryption_level", (col,) => col.setDefault("none",),)
    .execute();

  // Idempotent backfill: fix any existing "public" rows created before the
  // previous migration corrected this constraint
  await sql`UPDATE chats SET encryption_level = 'none' WHERE encryption_level = 'public'`.execute(database,);
}

export async function down(_database: Kysely<unknown>,): Promise<void> {
  // No-op: "public" was the historical default but is not a valid EncryptionLevel.
  // Rows that existed before this migration have already been backfilled to "none"
  // and the default has been corrected. There is no safe way to restore the
  // previous sentinel value for rows that may have been created with it.
}

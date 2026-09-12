// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat GM role (AC4 of TASK-chat-feature-ownership-transfer).
 *
 * Adds the `gm` role to `ChatParticipantRole` so a chat can have multiple
 * moderators beyond the creator. The `role_in_chat` column on
 * `chat_participants` is plain TEXT (parts/006_chat.ts), so any string value
 * is already insertable — no schema change is required. This migration
 * records the logical version bump so consumers that consult `schema_version`
 * can detect the new role.
 *
 * `up` bumps the logical schema version to 28; `down` reverses the bump
 * (no-op at the table level since `gm` is just a free-form text value).
 */
import type { Kysely, } from "kysely";
import { recordSchemaVersion, } from "../schema-version";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await recordSchemaVersion(database, 28, "chat participant gm role (AC4 ownership-transfer)",);
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  // The `gm` value is just text — there is no schema object to drop. The
  // version row, however, is recorded with `INSERT OR IGNORE`, so we cannot
  // delete the prior version here. Reverse-migrating is a no-op: a newer
  // migration or manual cleanup would be required to strip rows whose
  // `role_in_chat = "gm"` survived a downgrade.
  void database;
}

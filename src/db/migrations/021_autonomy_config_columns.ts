// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 021_autonomy_config_columns
 *
 * Adds `autonomy_config` (text, JSON) to `chats` and `worlds` so
 * autonomy pacing overrides can be layered: world default → chat
 * override → per-actor override. The column mirrors the existing
 * `character_internal_traits.autonomy_preferences` pattern: empty
 * object literal `{}` as the default, JSON-encoded at the storage
 * boundary.
 *
 * One ADD COLUMN per alterTable statement (SQLite limitation; see
 * `src/db/migrations/README.md`).
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("chats",)
    .addColumn(
      "autonomy_config",
      "text",
      (col,) => col.notNull().defaultTo(sql`('{}')`,),
    )
    .execute();

  await database.schema
    .alterTable("worlds",)
    .addColumn(
      "autonomy_config",
      "text",
      (col,) => col.notNull().defaultTo(sql`('{}')`,),
    )
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.alterTable("worlds",).dropColumn("autonomy_config",).execute();
  await database.schema.alterTable("chats",).dropColumn("autonomy_config",).execute();
}
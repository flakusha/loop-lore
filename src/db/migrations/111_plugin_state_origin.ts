// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 111_plugin_state_origin
 *
 * Marks each `plugin_state` approval row with the origin that earned it.
 * Reads now match (name, origin), so an active core row cannot authorize a
 * same-name community/local plugin. No backfill: pre-existing rows keep NULL
 * and deliberately match no origin — non-core plugins need fresh admin
 * approval; core keeps its existing self-approval default when no row matches.
 *
 * `plugin_state.name` is already the PRIMARY KEY, so a separate unique index
 * on (name, origin) would add nothing. Row identity stays name-keyed and the
 * admin enable/config paths move a row to the deciding origin explicitly.
 *
 * One ADD COLUMN per alterTable statement (SQLite limitation; see
 * `src/db/migrations/README.md`).
 */
import { type Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("plugin_state",)
    .addColumn("origin", "text",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.alterTable("plugin_state",).dropColumn("origin",).execute();
}

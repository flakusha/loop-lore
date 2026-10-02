// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 029_plugin_state_config
 *
 * Adds a nullable `config_json` TEXT column to `plugin_state` so an
 * admin can persist per-plugin config overrides (FEAT-051). The loader
 * merges this stored object over the manifest `config` defaults and
 * enforces `configSchema.required` on the merged result. Null means "no
 * stored override" — the loader falls back to manifest defaults.
 *
 * One ADD COLUMN per alterTable statement (SQLite limitation; see
 * `src/db/migrations/README.md`).
 */
import { type Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("plugin_state",)
    .addColumn("config_json", "text",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.alterTable("plugin_state",).dropColumn("config_json",).execute();
}

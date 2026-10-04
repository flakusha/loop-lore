// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 033_audit_columns_underdocumented_tables
 *
 * Adds the `created_at`/`updated_at` audit baseline to the 9 tables the DB
 * field-audit (2026-09-25) found lacking both columns. Purely additive: no
 * existing column is rewritten and no row is deleted.
 *
 * ── Why `created_at` is added nullable, then back-filled ───────
 *
 * `createTable` uses `created_at text NOT NULL DEFAULT (datetime('now'))`
 * (001_init). SQLite cannot reproduce that on an existing table: `ALTER TABLE
 * ... ADD COLUMN` rejects a non-constant default ("Cannot add a column with
 * non-constant default"), and it only surfaces when the table already holds
 * rows. So the column is added nullable and existing rows are stamped with
 * `datetime('now')` by the UPDATE pass below. This mirrors the repo convention
 * for ALTER-added audit columns (see 016_item_instance_state): add nullable,
 * back-fill, then let insert paths write the column. A writer that omits
 * `created_at` leaves it NULL rather than fabricating a timestamp.
 *
 * `updated_at` is left nullable: every table here is an append-only log, a
 * pivot row, or a terminal state, so an update never occurs and a permanent
 * non-NULL "last touched" would be a lie.
 *
 * `trade_history` and `nsfw_consent_state` already carried `created_at` from
 * 001_init, so only `updated_at` is added to those two.
 *
 * One ADD COLUMN per alterTable statement (SQLite limitation).
 *
 * TODO(perf): new rows on these 7 tables get NULL `created_at` — the insert
 * paths (e.g. `growth-service/crud-log.ts`, `chat/service/carry-pins.ts`) do
 * not yet write it. Deliberately NOT hooked: the SQLite-native alternatives to
 * a per-insert default all cost more than they save at this volume. A
 * `DEFAULT (datetime('now'))` is impossible here (see above) and an AFTER
 * INSERT trigger is exactly what 018_guard_triggers_update_twins was written to
 * unwind — an extra trigger fires per row on the write path and its error
 * surface is not worth one timestamp. Revisit if a table's insert rate makes
 * the NULL gap observable, or if a shared `created_at` insert helper lands; the
 * fix is then a column default on the createTable side of a table rebuild, not
 * a trigger.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("recipe_discoveries",)
    .addColumn("created_at", "text",)
    .execute();

  await database.schema
    .alterTable("recipe_discoveries",)
    .addColumn("updated_at", "text",)
    .execute();

  await database.schema
    .alterTable("travel_route_stops",)
    .addColumn("created_at", "text",)
    .execute();

  await database.schema
    .alterTable("travel_route_stops",)
    .addColumn("updated_at", "text",)
    .execute();

  await database.schema
    .alterTable("blog_tags",)
    .addColumn("created_at", "text",)
    .execute();

  await database.schema
    .alterTable("blog_tags",)
    .addColumn("updated_at", "text",)
    .execute();

  await database.schema
    .alterTable("chat_random_events",)
    .addColumn("created_at", "text",)
    .execute();

  await database.schema
    .alterTable("chat_random_events",)
    .addColumn("updated_at", "text",)
    .execute();

  await database.schema
    .alterTable("chat_pins",)
    .addColumn("created_at", "text",)
    .execute();

  await database.schema
    .alterTable("chat_pins",)
    .addColumn("updated_at", "text",)
    .execute();

  await database.schema
    .alterTable("growth_log",)
    .addColumn("created_at", "text",)
    .execute();

  await database.schema
    .alterTable("growth_log",)
    .addColumn("updated_at", "text",)
    .execute();

  await database.schema
    .alterTable("status_effect",)
    .addColumn("created_at", "text",)
    .execute();

  await database.schema
    .alterTable("status_effect",)
    .addColumn("updated_at", "text",)
    .execute();

  // `created_at` already present in 001_init for these two.
  await database.schema
    .alterTable("trade_history",)
    .addColumn("updated_at", "text",)
    .execute();

  await database.schema
    .alterTable("nsfw_consent_state",)
    .addColumn("updated_at", "text",)
    .execute();

  // Back-fill the freshly added (all-NULL) `created_at` on the 7 tables that
  // gained it. Runs after the ADD COLUMNs so a table with existing rows is
  // never left with a NULL creation stamp.
  await sql`UPDATE recipe_discoveries SET created_at = datetime('now') WHERE created_at IS NULL`.execute(database,);
  await sql`UPDATE travel_route_stops SET created_at = datetime('now') WHERE created_at IS NULL`.execute(database,);
  await sql`UPDATE blog_tags SET created_at = datetime('now') WHERE created_at IS NULL`.execute(database,);
  await sql`UPDATE chat_random_events SET created_at = datetime('now') WHERE created_at IS NULL`.execute(database,);
  await sql`UPDATE chat_pins SET created_at = datetime('now') WHERE created_at IS NULL`.execute(database,);
  await sql`UPDATE growth_log SET created_at = datetime('now') WHERE created_at IS NULL`.execute(database,);
  await sql`UPDATE status_effect SET created_at = datetime('now') WHERE created_at IS NULL`.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.alterTable("nsfw_consent_state",).dropColumn("updated_at",).execute();
  await database.schema.alterTable("trade_history",).dropColumn("updated_at",).execute();
  await database.schema.alterTable("status_effect",).dropColumn("updated_at",).execute();
  await database.schema.alterTable("status_effect",).dropColumn("created_at",).execute();
  await database.schema.alterTable("growth_log",).dropColumn("updated_at",).execute();
  await database.schema.alterTable("growth_log",).dropColumn("created_at",).execute();
  await database.schema.alterTable("chat_pins",).dropColumn("updated_at",).execute();
  await database.schema.alterTable("chat_pins",).dropColumn("created_at",).execute();
  await database.schema.alterTable("chat_random_events",).dropColumn("updated_at",).execute();
  await database.schema.alterTable("chat_random_events",).dropColumn("created_at",).execute();
  await database.schema.alterTable("blog_tags",).dropColumn("updated_at",).execute();
  await database.schema.alterTable("blog_tags",).dropColumn("created_at",).execute();
  await database.schema.alterTable("travel_route_stops",).dropColumn("updated_at",).execute();
  await database.schema.alterTable("travel_route_stops",).dropColumn("created_at",).execute();
  await database.schema.alterTable("recipe_discoveries",).dropColumn("updated_at",).execute();
  await database.schema.alterTable("recipe_discoveries",).dropColumn("created_at",).execute();
}

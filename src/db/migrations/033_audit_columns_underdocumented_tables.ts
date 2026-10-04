// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 033_audit_columns_underdocumented_tables
 *
 * Adds the `created_at`/`updated_at` audit baseline to the 9 tables the DB
 * field-audit (2026-09-25) found lacking both columns. Purely additive: no
 * existing column is rewritten and no row is deleted.
 *
 * `created_at` is NOT NULL with a `datetime('now')` default, so existing rows
 * are back-filled by the DEFAULT rather than needing a separate UPDATE pass.
 * `updated_at` is left nullable: every table here is an append-only log, a
 * pivot row, or a terminal state, so an update never occurs and a permanent
 * non-NULL "last touched" would be a lie.
 *
 * `trade_history` and `nsfw_consent_state` already carried `created_at` from
 * 001_init, so only `updated_at` is added to those two.
 *
 * One ADD COLUMN per alterTable statement (SQLite limitation).
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("recipe_discoveries",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();
  await database.schema
    .alterTable("recipe_discoveries",)
    .addColumn("updated_at", "text",)
    .execute();

  await database.schema
    .alterTable("travel_route_stops",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();
  await database.schema
    .alterTable("travel_route_stops",)
    .addColumn("updated_at", "text",)
    .execute();

  await database.schema
    .alterTable("blog_tags",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();
  await database.schema
    .alterTable("blog_tags",)
    .addColumn("updated_at", "text",)
    .execute();

  await database.schema
    .alterTable("chat_random_events",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();
  await database.schema
    .alterTable("chat_random_events",)
    .addColumn("updated_at", "text",)
    .execute();

  await database.schema
    .alterTable("chat_pins",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();
  await database.schema
    .alterTable("chat_pins",)
    .addColumn("updated_at", "text",)
    .execute();

  await database.schema
    .alterTable("growth_log",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();
  await database.schema
    .alterTable("growth_log",)
    .addColumn("updated_at", "text",)
    .execute();

  await database.schema
    .alterTable("status_effect",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
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

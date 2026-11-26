// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 017_plugin_state_origin_key — approval is keyed by (name, origin).
 *
 * 014 made `name` the sole PK while every read used (name, origin). A
 * same-name write could re-point a core row to another origin and reset its
 * approval, re-enabling a deliberately disabled core plugin. Rebuild the
 * table with a composite PK; NULL-origin backfill rows survive unchanged.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  // Raw DDL: the codegen parser must not see a second createTable for the
  // staging table or it would add a phantom table to the generated schema.
  await sql`CREATE TABLE "plugin_state_rebuilt" (
    name text not null,
    status text default 'active' not null,
    enabled_at text,
    disabled_at text,
    created_at text default (datetime('now')) not null,
    updated_at text default (datetime('now')) not null,
    config_json text,
    origin text,
    constraint pk_plugin_state primary key (name, origin)
  )`.execute(database,);

  await sql`INSERT INTO "plugin_state_rebuilt"
    (name, status, enabled_at, disabled_at, created_at, updated_at, config_json, origin)
    SELECT name, status, enabled_at, disabled_at, created_at, updated_at, config_json, origin
    FROM "plugin_state"`.execute(database,);

  await sql`DROP TABLE "plugin_state"`.execute(database,);
  await sql`ALTER TABLE "plugin_state_rebuilt" RENAME TO "plugin_state"`.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await sql`CREATE TABLE "plugin_state_name_keyed" (
    name text primary key,
    status text default 'active' not null,
    enabled_at text,
    disabled_at text,
    created_at text default (datetime('now')) not null,
    updated_at text default (datetime('now')) not null,
    config_json text,
    origin text
  )`.execute(database,);

  // ponytail: down collapses same-name rows to one; core wins, then oldest.
  await sql`INSERT INTO "plugin_state_name_keyed"
    (name, status, enabled_at, disabled_at, created_at, updated_at, config_json, origin)
    SELECT p.name, p.status, p.enabled_at, p.disabled_at, p.created_at, p.updated_at,
      p.config_json, p.origin
    FROM "plugin_state" p
    WHERE p.rowid = (
      SELECT q.rowid FROM "plugin_state" q WHERE q.name = p.name
      ORDER BY CASE WHEN q.origin = 'core' THEN 0 ELSE 1 END, q.rowid LIMIT 1
    )`.execute(database,);

  await sql`DROP TABLE "plugin_state"`.execute(database,);
  await sql`ALTER TABLE "plugin_state_name_keyed" RENAME TO "plugin_state"`.execute(database,);
}

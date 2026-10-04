// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Migration 033 — audit columns on underdocumented tables.
 *
 * Regression pin for the bug this migration shipped with: `created_at` was
 * declared `text NOT NULL DEFAULT (datetime('now'))` via ALTER TABLE. SQLite
 * rejects a non-constant default on ADD COLUMN — "Cannot add a column with
 * non-constant default" — but ONLY when the target table already holds rows.
 * The full-chain test migrates an empty database, so it never tripped it.
 *
 * This test creates the nine base tables with a row in each, then applies 033
 * and asserts the columns land and existing rows are back-filled.
 */
import { Database, } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Kysely, } from "kysely";
import { createSqliteDialect, } from "./index";
import { down, up, } from "./migrations/033_audit_columns_underdocumented_tables";

/** Tables that gained BOTH `created_at` and `updated_at` in 033. */
const WITH_BOTH = [
  "recipe_discoveries",
  "travel_route_stops",
  "blog_tags",
  "chat_random_events",
  "chat_pins",
  "growth_log",
  "status_effect",
];

/** Tables that already carried `created_at` from 001_init — only `updated_at`. */
const WITH_UPDATED_ONLY = ["trade_history", "nsfw_consent_state",];

const ALL_TABLES = [...WITH_BOTH, ...WITH_UPDATED_ONLY,];

/**
 * @param raw
 * @param table
 */
function columns(raw: Database, table: string,): Map<string, { notnull: number; dflt_value: string | null }> {
  const rows = raw.query(`PRAGMA table_info(${table})`,).all() as {
    name: string;
    notnull: number;
    dflt_value: string | null;
  }[];

  return new Map(rows.map((r,) => [r.name, r,]),);
}

describe("033_audit_columns_underdocumented_tables", () => {
  let raw: Database;
  let kysely: Kysely<unknown>;

  beforeEach(() => {
    raw = new Database(":memory:",);
    kysely = new Kysely({ dialect: createSqliteDialect(raw,), },);
  },);

  afterEach(async () => {
    await kysely.destroy();
    raw.close();
  },);

  test("applies to non-empty base tables and back-fills created_at", async () => {
    // Base tables with one row each — the shape that made the original
    // non-constant DEFAULT fail.
    for (const table of ALL_TABLES) {
      raw.run(`CREATE TABLE ${table} (id TEXT PRIMARY KEY)`,);
      raw.run(`INSERT INTO ${table} (id) VALUES ('row-1')`,);
    }

    await up(kysely,);

    for (const table of WITH_BOTH) {
      const cols = columns(raw, table,);
      expect(cols.has("created_at",), `${table}.created_at missing`,).toBe(true,);
      expect(cols.has("updated_at",), `${table}.updated_at missing`,).toBe(true,);

      const row = raw.query(`SELECT created_at FROM ${table} WHERE id = 'row-1'`,).get() as {
        created_at: string | null;
      };

      expect(row.created_at, `${table} existing row not back-filled`,).toBeTruthy();
    }

    for (const table of WITH_UPDATED_ONLY) {
      expect(columns(raw, table,).has("updated_at",), `${table}.updated_at missing`,).toBe(true,);
    }
  });

  test("down() drops the added columns", async () => {
    for (const table of ALL_TABLES) {
      raw.run(`CREATE TABLE ${table} (id TEXT PRIMARY KEY)`,);
    }

    await up(kysely,);
    await down(kysely,);

    for (const table of WITH_BOTH) {
      const cols = columns(raw, table,);
      expect(cols.has("created_at",), `${table}.created_at not dropped`,).toBe(false,);
      expect(cols.has("updated_at",), `${table}.updated_at not dropped`,).toBe(false,);
    }

    for (const table of WITH_UPDATED_ONLY) {
      expect(columns(raw, table,).has("updated_at",), `${table}.updated_at not dropped`,).toBe(false,);
    }
  });
});

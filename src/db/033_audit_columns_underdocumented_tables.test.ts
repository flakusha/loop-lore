// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Audit-column oracle against the final consolidated schema.
 *
 * Migration 033 declared `created_at` via ALTER TABLE with a non-constant
 * DEFAULT, which SQLite rejects when the target table already holds rows.
 * The consolidated migrations declare these columns inline at CREATE TABLE,
 * so the regression reduces to a final-shape assertion: all nine tables carry
 * the audit columns they were given.
 *
 * Resource contract: the test owns one private `:memory:` DB from createTestDb()
 * and disposes it in `finally`; it only reads PRAGMA metadata.
 */
import type { Database, } from "bun:sqlite";
import { describe, expect, test, } from "bun:test";
import { createTestDb, } from "../test-utils/create-test-db";

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

/**
 * @param sqlite private test DB handle
 * @param table table to introspect
 */
function columns(sqlite: Database, table: string,): Map<string, { notnull: number; dflt_value: string | null }> {
  const rows = sqlite.query(`PRAGMA table_info(${table})`,).all() as {
    name: string;
    notnull: number;
    dflt_value: string | null;
  }[];

  return new Map(rows.map((r,) => [r.name, r,]),);
}

describe("033 audit columns (final schema)", () => {
  test("all nine tables carry the audit columns declared by the final migrations", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      for (const table of WITH_BOTH) {
        const cols = columns(sqlite, table,);
        expect(cols.has("created_at",), `${table}.created_at missing`,).toBe(true,);
        expect(cols.has("updated_at",), `${table}.updated_at missing`,).toBe(true,);
      }

      for (const table of WITH_UPDATED_ONLY) {
        expect(columns(sqlite, table,).has("updated_at",), `${table}.updated_at missing`,).toBe(true,);
      }
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });
});

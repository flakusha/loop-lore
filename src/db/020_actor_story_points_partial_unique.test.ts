// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Migration 020 — partial unique indexes on actor_story_points.
 *
 * SQLite NULL semantics break the plain UNIQUE(actor_id, world_id)
 * index from migration 019 — two rows with the same actor_id and
 * world_id = NULL are both allowed. Migration 020 collapses any
 * pre-existing duplicates and then enforces uniqueness with two
 * partial indexes (one for `world_id IS NULL`, one for `world_id IS
 * NOT NULL`).
 *
 * These tests cover the dedupe behavior, the new index constraints,
 * and the round-trip through down().
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Kysely, sql, } from "kysely";

import { createLogger, } from "../logger";
import { createSqliteDialect, } from "./index";
import { getMigrationFiles, } from "./migrate";
// loadMigration inlined below
import type { DB, } from "./schema";

function makeInMemoryDb(): {
  kysely: Kysely<DB>;
  raw: import("bun:sqlite").Database;
} {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Database, } = require("bun:sqlite",) as typeof import("bun:sqlite");
  const raw = new Database(":memory:",);
  const kysely = new Kysely<DB>({ dialect: createSqliteDialect(raw,), },);
  return { kysely, raw, };
}

describe("020_actor_story_points_partial_unique", () => {
  let db: Kysely<DB>;
  let raw: import("bun:sqlite").Database;

  beforeEach(async () => {
    try {
      createLogger({ level: "error", },);
    } catch {
      // Logger already initialized — ignore.
    }
    const fresh = makeInMemoryDb();
    db = fresh.kysely;
    raw = fresh.raw;
    // Apply migrations 001..019 so the plain UNIQUE(actor_id, world_id)
    // index from 019 is in place (it allows duplicate NULL-world rows).
    // Migration 020 is applied separately by each test.
    const migrations = await getMigrationFiles();
    for (const name of Object.keys(migrations,).sort()) {
      if (name === "020_actor_story_points_partial_unique") { continue; }
      await migrations[name]!.up(db,);
    }
  },);

  afterEach(async () => {
    await db.destroy();
    raw.close();
  },);

  test("dedupes NULL-world rows on up() then enforces partial unique", async () => {
    const migrations = await getMigrationFiles();
    const migration = migrations["020_actor_story_points_partial_unique"];
    if (!migration) { throw new Error("migration 020 not registered",); }
    // Insert two duplicate NULL-world rows by hand — mimics the pre-fix
    // shape where the unique index let them both in.
    await db
      .insertInto("actor_story_points",)
      .values({
        id: "row-a",
        actor_id: "actor-dup",
        world_id: null,
        balance: 3,
        earned_total: 5,
        spent_total: 2,
        cap: null,
        created_at: "2026-01-01 00:00:00",
        updated_at: "2026-01-01 00:00:00",
      },)
      .execute();
    await db
      .insertInto("actor_story_points",)
      .values({
        id: "row-b",
        actor_id: "actor-dup",
        world_id: null,
        balance: 7,
        earned_total: 10,
        spent_total: 3,
        cap: null,
        created_at: "2026-01-02 00:00:00",
        updated_at: "2026-01-02 00:00:00",
      },)
      .execute();

    // Re-run with the duplicates in place: 020 dedupes by collapsing to
    // the oldest (row-a) and sums counters.
    await migration.up(db,);

    const rows = await db
      .selectFrom("actor_story_points",)
      .select(["id", "actor_id", "world_id", "balance", "earned_total", "spent_total",],)
      .where("actor_id", "=", "actor-dup",)
      .where("world_id", "is", null,)
      .execute();
    expect(rows,).toHaveLength(1,);
    const survivor = rows[0]!;
    expect(survivor.id,).toBe("row-a",);
    expect(survivor.balance,).toBe(10,); // 3 + 7
    expect(survivor.earned_total,).toBe(15,); // 5 + 10
    expect(survivor.spent_total,).toBe(5,); // 2 + 3

    // After up(), a fresh NULL-world row for the same actor must fail.
    let insertFailed = false;
    try {
      await db
        .insertInto("actor_story_points",)
        .values({
          id: "row-c",
          actor_id: "actor-dup",
          world_id: null,
          balance: 0,
          earned_total: 0,
          spent_total: 0,
          cap: null,
          created_at: "2026-02-01 00:00:00",
          updated_at: "2026-02-01 00:00:00",
        },)
        .execute();
    } catch (err) {
      insertFailed = true;
      const msg = err instanceof Error ? err.message : String(err,);
      expect(msg,).toMatch(/UNIQUE/i,);
    }
    expect(insertFailed,).toBe(true,);
  });

  test("down() drops the partial indexes and restores the plain unique", async () => {
    const migrations = await getMigrationFiles();
    const migration = migrations["020_actor_story_points_partial_unique"]!;
    // Apply 020 first so its partial indexes exist before we revert.
    await migration.up(db,);
    if (!migration.down) { throw new Error("migration 020 has no down",); }
    await migration.down(db,);

    // After down(), inserting two NULL-world rows for the same actor
    // must succeed again (the regression we're guarding against).
    await db
      .insertInto("actor_story_points",)
      .values({
        id: "row-x",
        actor_id: "actor-revert",
        world_id: null,
        balance: 0,
        earned_total: 0,
        spent_total: 0,
        cap: null,
        created_at: "2026-03-01 00:00:00",
        updated_at: "2026-03-01 00:00:00",
      },)
      .execute();
    await db
      .insertInto("actor_story_points",)
      .values({
        id: "row-y",
        actor_id: "actor-revert",
        world_id: null,
        balance: 0,
        earned_total: 0,
        spent_total: 0,
        cap: null,
        created_at: "2026-03-01 00:00:01",
        updated_at: "2026-03-01 00:00:01",
      },)
      .execute();

    const rows = await db
      .selectFrom("actor_story_points",)
      .select("id",)
      .where("actor_id", "=", "actor-revert",)
      .execute();
    expect(rows,).toHaveLength(2,);
  });
});

// Suppress unused-import warnings: `sql` is referenced via the loader,
// keep the import for parity with the round-trip test pattern.
void sql;

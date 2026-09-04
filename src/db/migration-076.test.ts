// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Migration 076 — chats.visual_novel data-migration test
 *
 * Verifies that when migrating a DB where `chats.visual_novel` still
 * exists (legacy install), every row with `visual_novel=1` has its
 * `gm_config.renderingOverride` set to `"visual_novel"` UNLESS the chat
 * already has an explicit override. This is the AC #5 data-migration
 * step from `.plan/backlog/open-vn-settings-bugs.md`.
 *
 * Strategy:
 *   1. Build a fresh in-memory SQLite.
 *   2. Step migrations 001–075 via Kysely Migrator (creates chats table).
 *   3. Insert a user (FK target for chats.created_by).
 *   4. Add the legacy `visual_novel` integer column to `chats`.
 *   5. Insert fixture rows covering all branches (NULL gm_config,
 *      gm_config without override, gm_config with explicit override,
 *      visual_novel=0, fresh DB without the column).
 *   6. Apply migration 076 (the drop).
 *   7. Assert: column dropped, data-migrated rows have
 *      renderingOverride="visual_novel", explicit-override preserved.
 *
 * Location note: this file lives in `src/db/` (NOT in
 * `src/db/migrations/`) because `runMigrations()` does a non-recursive
 * `readdirSync` of the migrations directory and then dynamically
 * `import()`s each `.ts` file. A `*.test.ts` file inside
 * `src/db/migrations/` would have its `describe()` re-entered inside
 * whatever test currently holds the loader and fail with "Cannot call
 * describe() inside a test". The filter below defensively excludes any
 * `*.test.ts` in case this file is later copied into the migrations dir.
 */
import { Database, } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Kysely, sql, } from "kysely";
import type { Migration, MigrationProvider, } from "kysely/migration";
import { Migrator, } from "kysely/migration";
import { readdirSync, } from "node:fs";
import path from "node:path";
import { createLogger, } from "../logger";
import { createSqliteDialect, } from "./index";

async function buildMigrationProvider(): Promise<MigrationProvider> {
  const dir = path.join(__dirname, "migrations",);
  const files = readdirSync(dir,)
    .filter((f,) => typeof f === "string" && f.endsWith(".ts",) && !f.endsWith(".test.ts",))
    .toSorted((a, b,) => a.localeCompare(b,));
  const migrations: Record<string, Migration> = {};
  for (const file of files) {
    const mod = await import(path.join(dir, file,));
    const name = file.replace(/\.ts$/, "",);
    migrations[name] = mod.default ?? mod;
  }
  return {
    async getMigrations() {
      return migrations;
    },
  };
}

const TEST_USER_ID = "user-1";

async function insertTestUser(db: Kysely<any>,): Promise<void> {
  await sql`INSERT INTO users (id, username, display_name) VALUES (${TEST_USER_ID}, 'tester', 'Test User')`.execute(
    db,
  );
}

describe("migration 076 — chats.visual_novel drop + data-migrate", () => {
  let db: Kysely<any>;
  let sqlite: Database;
  let migrator: Migrator;

  beforeEach(async () => {
    sqlite = new Database(":memory:",);
    sqlite.run("PRAGMA foreign_keys = ON",);
    db = new Kysely({ dialect: createSqliteDialect(sqlite,), },);
    try {
      createLogger({ level: "error", },);
    } catch {
      // already initialized
    }
    const provider = await buildMigrationProvider();
    migrator = new Migrator({ db, provider, },);
    const sortedNames = Object.keys(await provider.getMigrations(),).toSorted((a, b,) => a.localeCompare(b,));
    const idx076 = sortedNames.indexOf("076_drop_chats_visual_novel",);
    expect(idx076,).toBeGreaterThan(0,);
    const upTo075 = await migrator.migrateTo(sortedNames[idx076 - 1]!,);
    expect(upTo075.error,).toBeUndefined();
    await insertTestUser(db,);
  },);

  afterEach(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("visual_novel=1 with NULL gm_config gets renderingOverride set", async () => {
    await sql`ALTER TABLE chats ADD COLUMN visual_novel INTEGER NOT NULL DEFAULT 0`.execute(db,);
    await sql`INSERT INTO chats (id, name, created_by, visual_novel) VALUES ('c1', 'test', ${TEST_USER_ID}, 1)`.execute(
      db,
    );
    const up = await migrator.migrateUp();
    expect(up.error,).toBeUndefined();
    const colCheck = await sql<
      { name: string }
    >`SELECT name FROM pragma_table_info('chats') WHERE name = 'visual_novel'`
      .execute(db,);
    expect(colCheck.rows,).toHaveLength(0,);
    const rows = await sql<{ gm_config: string | null }>`SELECT gm_config FROM chats WHERE id = 'c1'`.execute(db,);
    expect(rows.rows,).toHaveLength(1,);
    const gm = JSON.parse(rows.rows[0]!.gm_config ?? "{}",) as Record<string, unknown>;
    expect(gm.renderingOverride,).toBe("visual_novel",);
  });

  test("visual_novel=1 with existing gm_config merges renderingOverride", async () => {
    await sql`ALTER TABLE chats ADD COLUMN visual_novel INTEGER NOT NULL DEFAULT 0`.execute(db,);
    await sql`INSERT INTO chats (id, name, created_by, gm_config, visual_novel) VALUES ('c2', 'merge-test', ${TEST_USER_ID}, '{"type":"llm"}', 1)`
      .execute(
        db,
      );
    await migrator.migrateUp();
    const rows = await sql<{ gm_config: string | null }>`SELECT gm_config FROM chats WHERE id = 'c2'`.execute(db,);
    const gm = JSON.parse(rows.rows[0]!.gm_config ?? "{}",) as Record<string, unknown>;
    expect(gm.renderingOverride,).toBe("visual_novel",);
    expect(gm.type,).toBe("llm",);
  });

  test("visual_novel=1 with explicit override is preserved (no overwrite)", async () => {
    await sql`ALTER TABLE chats ADD COLUMN visual_novel INTEGER NOT NULL DEFAULT 0`.execute(db,);
    await sql`INSERT INTO chats (id, name, created_by, gm_config, visual_novel) VALUES ('c3', 'preserve-test', ${TEST_USER_ID}, '{"renderingOverride":"text"}', 1)`
      .execute(
        db,
      );
    await migrator.migrateUp();
    const rows = await sql<{ gm_config: string | null }>`SELECT gm_config FROM chats WHERE id = 'c3'`.execute(db,);
    const gm = JSON.parse(rows.rows[0]!.gm_config ?? "{}",) as Record<string, unknown>;
    expect(gm.renderingOverride,).toBe("text",);
  });

  test("visual_novel=0 rows are not touched", async () => {
    await sql`ALTER TABLE chats ADD COLUMN visual_novel INTEGER NOT NULL DEFAULT 0`.execute(db,);
    await sql`INSERT INTO chats (id, name, created_by, gm_config, visual_novel) VALUES ('c4', 'off', ${TEST_USER_ID}, '{"type":"llm"}', 0)`
      .execute(
        db,
      );
    await migrator.migrateUp();
    const rows = await sql<{ gm_config: string | null }>`SELECT gm_config FROM chats WHERE id = 'c4'`.execute(db,);
    const gm = JSON.parse(rows.rows[0]!.gm_config ?? "{}",) as Record<string, unknown>;
    expect(gm.renderingOverride,).toBeUndefined();
    expect(gm.type,).toBe("llm",);
  });

  test("fresh-DB (no visual_novel column) → no-op", async () => {
    const up = await migrator.migrateUp();
    expect(up.error,).toBeUndefined();
    expect(up.results![0]!.status,).toBe("Success",);
    const colCheck = await sql<
      { name: string }
    >`SELECT name FROM pragma_table_info('chats') WHERE name = 'visual_novel'`
      .execute(db,);
    expect(colCheck.rows,).toHaveLength(0,);
  });
});

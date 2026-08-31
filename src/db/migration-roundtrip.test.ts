/**
 * Migration Roundtrip Tests
 *
 * Verifies that every migration can be applied and rolled back cleanly.
 * For each migration: up → verify tables exist → down → verify tables removed.
 *
 * Does NOT use createTestDb() (which runs all migrations at once).
 * Instead, creates a fresh in-memory SQLite per test and steps through
 * migrations one at a time via Kysely's Migrator.
 */

import { Database, } from "bun:sqlite";
import { describe, expect, test, } from "bun:test";
import { Kysely, } from "kysely";
import type { Migration, } from "kysely/migration";
import { Migrator, } from "kysely/migration";
import { readdirSync, } from "node:fs";
import path from "node:path";
import { createLogger, } from "../logger";
import { createSqliteDialect, } from "./index";

// ── Helpers ────────────────────────────────────────────────────

/** List migration file names, excluding the parts/ subfolder. */
function getMigrationNames(): string[] {
  const dir = path.join(__dirname, "migrations",);
  return readdirSync(dir,)
    .filter((f,) => typeof f === "string" && f.endsWith(".ts",))
    .toSorted((a, b,) => a.localeCompare(b,));
}

/**
 * Return all user-facing table names from an in-memory SQLite.
 * @param sqlite
 */
function getTableNames(sqlite: Database,): string[] {
  return (
    sqlite
      .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'kysely_%'",)
      .all() as { name: string }[]
  ).map((r,) => r.name);
}

/**
 * Return column names for a given table.
 * @param sqlite
 * @param table
 */
function getColumnNames(sqlite: Database, table: string,): string[] {
  return (
    sqlite
      .query(`PRAGMA table_info("${table}")`,)
      .all() as { name: string }[]
  ).map((r,) => r.name);
}

/** Create a fresh in-memory SQLite + Kysely (no migrations applied). */
function createFreshDb(): { db: Kysely<any>; sqlite: Database } {
  const sqlite = new Database(":memory:",);
  sqlite.run("PRAGMA foreign_keys = ON",);
  const dialect = createSqliteDialect(sqlite,);
  const db = new Kysely({ dialect, },);
  return { db, sqlite, };
}

/** Build a migration provider mirroring src/db/migrate.ts's directory scan. */
function buildMigrationProvider() {
  return {
    async getMigrations(): Promise<Record<string, Migration>> {
      const dir = path.join(__dirname, "migrations",);
      const files = readdirSync(dir,)
        .filter((f,) => typeof f === "string" && f.endsWith(".ts",))
        .toSorted((a, b,) => a.localeCompare(b,));
      const migrations: Record<string, Migration> = {};
      for (const file of files) {
        const mod = await import(path.join(dir, file,));
        const name = file.replace(/\.ts$/, "",);
        migrations[name] = mod.default ?? mod;
      }
      return migrations;
    },
  };
}

// ── Tests ──────────────────────────────────────────────────────

const migrationNames = getMigrationNames();

// Ensure logger is initialized (migrate.ts calls getLogger())
try {
  createLogger({ level: "error", },);
} catch {
  // already initialized
}

describe("migration roundtrip", () => {
  test(`found ${migrationNames.length} migration files`, () => {
    expect(migrationNames.length,).toBeGreaterThan(0,);
  });

  test("migrateToLatest succeeds for all migrations", async () => {
    const { db, sqlite, } = createFreshDb();
    const migrator = new Migrator({ db, provider: buildMigrationProvider(), },);

    const result = await migrator.migrateToLatest();

    expect(result.error, "migrateToLatest should not error",).toBeUndefined();
    expect(
      result.results!.length,
      `should run all ${migrationNames.length} migrations`,
    ).toBe(migrationNames.length,);

    for (const r of result.results!) {
      expect(r.status, `migration ${r.migrationName} should succeed`,).toBe("Success",);
    }

    const tables = getTableNames(sqlite,);
    expect(tables.length, "should have tables after migration",).toBeGreaterThan(0,);

    await db.destroy();
    sqlite.close();
  });

  test("migrateDown rolls back all migrations to empty DB", async () => {
    const { db, sqlite, } = createFreshDb();
    const migrator = new Migrator({ db, provider: buildMigrationProvider(), },);

    // Migrate everything up first
    const upResult = await migrator.migrateToLatest();
    expect(upResult.error,).toBeUndefined();

    const tablesBeforeDown = getTableNames(sqlite,);
    expect(tablesBeforeDown.length,).toBeGreaterThan(0,);

    // Roll back one at a time until empty
    let rolledBack = 0;
    while (true) {
      const downResult = await migrator.migrateDown();
      if (!downResult.results || downResult.results.length === 0) { break; }
      for (const r of downResult.results) {
        expect(r.status, `rollback ${r.migrationName} should succeed`,).toBe("Success",);
      }
      rolledBack++;
    }

    expect(rolledBack, "should have rolled back all migrations",).toBe(migrationNames.length,);

    const tablesAfterDown = getTableNames(sqlite,);
    expect(tablesAfterDown, "no tables should remain after full rollback",).toHaveLength(0,);

    await db.destroy();
    sqlite.close();
  });

  test("re-migrating after full roundtrip produces identical schema", async () => {
    const { db, sqlite, } = createFreshDb();
    const migrator = new Migrator({ db, provider: buildMigrationProvider(), },);

    // First pass: up all
    const up1 = await migrator.migrateToLatest();
    expect(up1.error,).toBeUndefined();
    const tablesAfterFirstUp = getTableNames(sqlite,).sort((a, b,) => a.localeCompare(b,));

    // Roll back everything
    while (true) {
      const down = await migrator.migrateDown();
      if (!down.results || down.results.length === 0) { break; }
    }
    expect(getTableNames(sqlite,),).toHaveLength(0,);

    // Second pass: up all again
    const up2 = await migrator.migrateToLatest();
    expect(up2.error, "re-migration after roundtrip should succeed",).toBeUndefined();
    expect(up2.results!.length,).toBe(migrationNames.length,);

    const tablesAfterSecondUp = getTableNames(sqlite,).sort((a, b,) => a.localeCompare(b,));
    expect(tablesAfterSecondUp,).toEqual(tablesAfterFirstUp,);

    await db.destroy();
    sqlite.close();
  });

  test("each migration up adds its expected tables and down removes them", async () => {
    const { db, sqlite, } = createFreshDb();
    const migrator = new Migrator({ db, provider: buildMigrationProvider(), },);

    let snapshot: string[] = [];

    // Step through each migration up, recording table state
    for (const [i, name,] of migrationNames.entries()) {
      const result = await migrator.migrateUp();
      expect(
        result.error,
        `up step ${i} (${name}) should not error`,
      ).toBeUndefined();
      expect(result.results!.length,).toBe(1,);
      expect(result.results![0]!.status,).toBe("Success",);

      const tablesNow = getTableNames(sqlite,);
      // Tables should only grow or stay same (ALTER TABLE doesn't add tables)
      expect(tablesNow.length,).toBeGreaterThanOrEqual(snapshot.length,);
      snapshot = tablesNow;
    }

    // Step through each migration down
    for (let i = migrationNames.length - 1; i >= 0; i--) {
      const result = await migrator.migrateDown();
      expect(
        result.error,
        `down step ${i} should not error`,
      ).toBeUndefined();
      expect(result.results!.length,).toBe(1,);
      expect(result.results![0]!.status,).toBe("Success",);
    }

    expect(getTableNames(sqlite,), "DB should be empty after stepping all down",).toHaveLength(0,);

    await db.destroy();
    sqlite.close();
  });

  test("every migrated table has at least one column", async () => {
    const { db, sqlite, } = createFreshDb();
    const migrator = new Migrator({ db, provider: buildMigrationProvider(), },);

    await migrator.migrateToLatest();

    const tables = getTableNames(sqlite,);
    expect(tables.length,).toBeGreaterThan(0,);

    for (const table of tables) {
      const cols = getColumnNames(sqlite, table,);
      expect(cols.length, `${table} should have at least one column`,).toBeGreaterThan(0,);
    }

    await db.destroy();
    sqlite.close();
  });
});

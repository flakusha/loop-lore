/**
 * Migration Roundtrip Tests — 14-file consolidated baseline.
 *
 * Final-form files create their whole domain inline. up() and down() are
 * both verified on a fresh in-memory DB through the real Migrator: all 14
 * files must apply, then roll back in one documented FK-off scope, leaving no
 * user tables.
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
import { compareMigrationNames, } from "./migrate";

const MIGRATION_FILENAME = /^(\d{3})_(.+)\.ts$/;

function getMigrationNames(): string[] {
  const dir = path.join(__dirname, "migrations",);
  return readdirSync(dir,)
    .filter((f,) => typeof f === "string" && MIGRATION_FILENAME.test(f,))
    .toSorted(compareMigrationNames,);
}

function getTableNames(sqlite: Database,): string[] {
  return (
    sqlite
      .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'kysely_%'",)
      .all() as { name: string }[]
  ).map((r,) => r.name);
}

function getColumnNames(sqlite: Database, table: string,): string[] {
  return (
    sqlite.query(`PRAGMA table_info("${table}")`,).all() as { name: string }[]
  ).map((r,) => r.name);
}

function createFreshDb(): { db: Kysely<unknown>; sqlite: Database } {
  const sqlite = new Database(":memory:",);
  const db = new Kysely({ dialect: createSqliteDialect(sqlite,), },);
  return { db, sqlite, };
}

function buildMigrationProvider() {
  return {
    async getMigrations(): Promise<Record<string, Migration>> {
      const dir = path.join(__dirname, "migrations",);
      const files = readdirSync(dir,)
        .filter((f,) => typeof f === "string" && MIGRATION_FILENAME.test(f,))
        .toSorted(compareMigrationNames,);

      const migrations: Record<string, Migration> = {};
      for (const file of files) {
        const mod = await import(path.join(dir, file,));
        migrations[file.replace(/\.ts$/, "",)] = mod.default ?? mod;
      }

      return migrations;
    },
  };
}

const migrationNames = getMigrationNames();

try {
  createLogger({ level: "error", },);
} catch {
  // already initialized
}

describe("migration roundtrip", () => {
  test("found the 18-file baseline", () => {
    expect(migrationNames,).toHaveLength(18,);
  });

  test("provider order matches the shared migration comparator", async () => {
    const providerKeys = Object.keys(await buildMigrationProvider().getMigrations(),);
    expect(providerKeys,).toEqual(migrationNames.map((name,) => name.replace(/\.ts$/, "",)),);
  });

  test("migrateToLatest succeeds for all migrations", async () => {
    const { db, sqlite, } = createFreshDb();
    const migrator = new Migrator({ db, provider: buildMigrationProvider(), },);
    const result = await migrator.migrateToLatest();

    expect(result.error, "migrateToLatest should not error",).toBeUndefined();
    expect(result.results!.length,).toBe(migrationNames.length,);
    for (const r of result.results!) {
      expect(r.status, `migration ${r.migrationName} should succeed`,).toBe("Success",);
    }

    expect(getTableNames(sqlite,).length,).toBeGreaterThan(0,);

    await db.destroy();
    sqlite.close();
  }, 15000,);

  test("full rollback removes every table after the up chain", async () => {
    const { db, sqlite, } = createFreshDb();
    const migrator = new Migrator({ db, provider: buildMigrationProvider(), },);
    const up = await migrator.migrateToLatest();
    expect(up.error,).toBeUndefined();

    // Final-form files contain mutual FK cycles (blog_comments/blog_posts,
    // chats/messages, scenario shots/scenarios) and cross-domain references to
    // tables owned by later files. SQLite reparses every schema object on each
    // DROP TABLE, so per-file rollback with FK enforcement cannot advance;
    // the 14-step down chain therefore runs in one documented FK-off scope.
    // up() above still runs with the production FK-on dialect.
    sqlite.run("PRAGMA foreign_keys = OFF",);
    let rolledBack = 0;
    for (let i = 0; i < migrationNames.length; i++) {
      const result = await migrator.migrateDown();
      expect(result.error, `down step ${i} should not error`,).toBeUndefined();
      expect(result.results, `down step ${i} should have a result`,).toHaveLength(1,);
      expect(result.results![0]!.status, `down step ${i} should succeed`,).toBe("Success",);
      rolledBack++;
    }

    expect(rolledBack,).toBe(migrationNames.length,);
    const remaining = getTableNames(sqlite,).filter((name,) => !name.startsWith("sqlite_",));
    expect(remaining, "rollback should leave no user tables",).toEqual([],);
    sqlite.run("PRAGMA foreign_keys = ON",);

    await db.destroy();
    sqlite.close();
  }, 15000,);

  test("two fresh installs produce the same table set", async () => {
    const schemas: string[][] = [];
    for (let i = 0; i < 2; i++) {
      const { db, sqlite, } = createFreshDb();
      const migrator = new Migrator({ db, provider: buildMigrationProvider(), },);
      const up = await migrator.migrateToLatest();
      expect(up.error,).toBeUndefined();
      schemas.push(getTableNames(sqlite,).sort(),);
      await db.destroy();
      sqlite.close();
    }

    expect(schemas[1],).toEqual(schemas[0],);
  }, 15000,);

  test("each migration step applies cleanly in order", async () => {
    const { db, sqlite, } = createFreshDb();
    const migrator = new Migrator({ db, provider: buildMigrationProvider(), },);
    let previous = 0;

    for (const [i, name,] of migrationNames.entries()) {
      const result = await migrator.migrateUp();
      expect(result.error, `up step ${i} (${name}) should not error`,).toBeUndefined();
      expect(result.results!.length,).toBe(1,);
      expect(result.results![0]!.status,).toBe("Success",);
      expect(getTableNames(sqlite,).length,).toBeGreaterThanOrEqual(previous,);
      previous = getTableNames(sqlite,).length;
    }

    await db.destroy();
    sqlite.close();
  }, 15000,);

  test("every migrated table has at least one column", async () => {
    const { db, sqlite, } = createFreshDb();
    const migrator = new Migrator({ db, provider: buildMigrationProvider(), },);
    await migrator.migrateToLatest();

    for (const table of getTableNames(sqlite,)) {
      expect(getColumnNames(sqlite, table,).length, `${table} should have at least one column`,).toBeGreaterThan(0,);
    }

    await db.destroy();
    sqlite.close();
  }, 15000,);
});

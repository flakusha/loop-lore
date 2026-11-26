// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Database, } from "bun:sqlite";
import { afterEach, describe, expect, test, } from "bun:test";
import { Kysely, sql, } from "kysely";
import { mkdtempSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import path from "node:path";
import { createLogger, } from "../logger";
import { createSqliteDialect, } from "./index";
import { assertMigrationsNotStale, getMigrationFiles, runMigrations, } from "./migrate";
import type { DB, } from "./schema";

createLogger({ level: "error", },);

const openHandles: Array<{ raw: Database; kysely: Kysely<DB> }> = [];
const sandboxDirs: string[] = [];

/**
 * File-backed pair sharing one SQLite file: a raw handle (the rival process)
 * plus a Kysely handle (the migrating boot).
 */
function sandboxPair(name: string,): { file: string; raw: Database; kysely: Kysely<DB> } {
  const dir = mkdtempSync(path.join(tmpdir(), "f7-migrate-",),);
  sandboxDirs.push(dir,);
  const file = path.join(dir, name,);
  const raw = new Database(file,);
  const kysely = new Kysely<DB>({ dialect: createSqliteDialect(new Database(file,),), },);
  openHandles.push({ raw, kysely, },);
  return { file, raw, kysely, };
}

afterEach(async () => {
  for (const h of openHandles.splice(0,)) {
    await h.kysely.destroy().catch(() => undefined);
    h.raw.close();
  }

  for (const dir of sandboxDirs.splice(0,)) {
    rmSync(dir, { recursive: true, force: true, },);
  }
},);

describe("runMigrations cross-process guard", () => {
  test(
    "second migrator fails loud naming the DB path while another connection holds the write lock",
    async () => {
      const { file, raw, kysely, } = sandboxPair("race.db",);
      raw.run("BEGIN IMMEDIATE",);
      let failure: unknown;
      try {
        await runMigrations(kysely,);
      } catch (error) {
        failure = error;
      } finally {
        raw.run("ROLLBACK",);
      }

      expect(failure,).toBeInstanceOf(Error,);
      expect((failure as Error).message,).toContain(file,);
      expect((failure as Error).message,).toMatch(/another process is migrating/,);
    },
    30_000,
  );

  test(
    "rerun against a migrated file applies nothing and exits cleanly",
    async () => {
      const { kysely, } = sandboxPair("rerun.db",);
      await runMigrations(kysely,);
      const { rows, } = await sql<{ n: number }>`select count(*) as n from kysely_migration`.execute(kysely,);
      expect(rows[0]!.n,).toBeGreaterThan(0,);
      await expect(runMigrations(kysely,),).resolves.toBeUndefined();
      const { rows: again, } = await sql<{ n: number }>`select count(*) as n from kysely_migration`.execute(kysely,);
      expect(again[0]!.n,).toBe(rows[0]!.n,);
    },
    120_000,
  );
});

describe("stale migration guard", () => {
  test("names retired migrations and the 14-file recovery path", async () => {
    const sqlite = new Database(":memory:",);
    const db = new Kysely<DB>({ dialect: createSqliteDialect(sqlite,), },);
    try {
      await sql`CREATE TABLE kysely_migration (name text PRIMARY KEY, timestamp integer, completed integer)`.execute(
        db,
      );

      await sql`INSERT INTO kysely_migration (name, timestamp, completed) VALUES (${"001_init"}, 1, 1), (${"119_agent_tickets_scope"}, 1, 1)`
        .execute(db,);

      const migrations = await getMigrationFiles();
      const guard = assertMigrationsNotStale(db, migrations,);

      await expect(guard,).rejects.toThrow(/001_init/,);
      await expect(guard,).rejects.toThrow(/This local database predates the 14-file consolidated baseline/,);
      await expect(guard,).rejects.toThrow(
        /Recovery: export any data you need, recreate the DB \(db:reinit\), then import\./,
      );
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });
});

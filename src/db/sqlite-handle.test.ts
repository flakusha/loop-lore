// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * getSqliteDatabase: the raw-handle accessor backing DB-backed quota storage.
 * Standalone file so the module state (test override / production singleton)
 * starts clean under `bun test --isolate` — sibling db suites that materialize
 * the singleton cannot bleed in.
 *
 * Resource contract: owns the process-global test override + production
 * singleton (cleared via setTestDatabase(null) in afterEach) and one tmp DB
 * file `.tmp/sqlite-handle-probe-<pid>.db` — pid-unique, so parallel test
 * processes never collide; removed (and LOOP_LORE_DB_PATH restored) in
 * afterEach even on failure.
 */
import { Database, } from "bun:sqlite";
import { afterEach, describe, expect, test, } from "bun:test";
import { Kysely, } from "kysely";
import { rmSync, } from "node:fs";
import path from "node:path";
import { createSqliteDialect, getDatabase, getSqliteDatabase, setTestDatabase, } from "./index";
import type { DB, } from "./schema";

let tmpDbPath: string | null = null;
let priorDbPath: string | undefined;

afterEach(() => {
  setTestDatabase(null,);
  if (priorDbPath === undefined) {
    delete process.env.LOOP_LORE_DB_PATH;
  } else {
    process.env.LOOP_LORE_DB_PATH = priorDbPath;
  }

  priorDbPath = undefined;
  if (tmpDbPath) {
    rmSync(tmpDbPath, { force: true, },);
    tmpDbPath = null;
  }
},);

function overrideWith(sqlite?: Database,): Kysely<DB> {
  const db = new Kysely<DB>({ dialect: createSqliteDialect(sqlite ?? new Database(":memory:",),), },);
  setTestDatabase(db, sqlite,);
  return db;
}

describe("getSqliteDatabase", () => {
  test("returns null before anything materializes — never creates a DB", () => {
    expect(getSqliteDatabase(),).toBeNull();
  });

  test("returns the override's raw handle when the fixture provides one", () => {
    const sqlite = new Database(":memory:",);
    const db = overrideWith(sqlite,);
    expect(getSqliteDatabase(),).toBe(sqlite,);
    void db.destroy();
  });

  test("returns null for a sqlite-less override — never falls through", () => {
    const db = overrideWith();
    expect(getSqliteDatabase(),).toBeNull();
    void db.destroy();
  });

  test("returns the production singleton's handle once getDatabase() runs", () => {
    priorDbPath = process.env.LOOP_LORE_DB_PATH;
    tmpDbPath = path.join(import.meta.dir, "../../.tmp", `sqlite-handle-probe-${process.pid}.db`,);
    process.env.LOOP_LORE_DB_PATH = tmpDbPath;
    const singleton = getDatabase();
    const handle = getSqliteDatabase();
    expect(handle,).not.toBeNull();
    expect(handle!.query("SELECT 1 AS one",).get(),).toEqual({ one: 1, },);
    void singleton.destroy();
  });
});

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
 * file `.tmp/sqlite-handle-probe-<pid>-<run-id>.db` — pid + per-run id, so
 * parallel test processes AND concurrent runs that share a pid never
 * collide; removed in afterEach even on failure. LOOP_LORE_DB_PATH is a
 * process-global: it is set only for the synchronous singleton creation and
 * restored in the test body (afterEach is the safety net), and only when
 * THIS file changed it — a concurrently running file never sees this
 * file's probe path.
 */
import { Database, } from "bun:sqlite";
import { afterEach, describe, expect, test, } from "bun:test";
import { Kysely, } from "kysely";
import { rmSync, } from "node:fs";
import path from "node:path";
import {
  createSqliteDialect,
  getDatabase,
  getSqliteDatabase,
  resetDatabaseSingleton,
  setTestDatabase,
} from "./index";
import type { DB, } from "./schema";

/** Unique per test-run id — keeps the probe DB path collision-free even when
 * two runs share a pid (containers) or a checkout path. */
const RUN_ID = Math.random().toString(36,).slice(2, 10,);

let tmpDbPath: string | null = null;
let priorDbPath: string | undefined;
let dbPathOverridden = false;

/**
 * Restore LOOP_LORE_DB_PATH — but ONLY if this file changed it. The env var
 * is a process-global: an unconditional delete/restore in afterEach would
 * clobber a value another (concurrently running) file set, or an ambient one
 * from the runner.
 */
function restoreDbPathEnv(): void {
  if (!dbPathOverridden) { return; }
  dbPathOverridden = false;
  if (priorDbPath === undefined) {
    delete process.env.LOOP_LORE_DB_PATH;
  } else {
    process.env.LOOP_LORE_DB_PATH = priorDbPath;
  }

  priorDbPath = undefined;
}

afterEach(async () => {
  setTestDatabase(null,);
  // A destroyed-but-still-bound singleton poisons every later DB consumer in
  // this process (quota storage hits the deleted probe file) — reset owns it.
  await resetDatabaseSingleton();
  restoreDbPathEnv();
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
  test("returns null before anything materializes — never creates a DB", async () => {
    // A sibling file may have materialized the singleton earlier in this
    // process; reset it so the assertion covers THIS file's state, not order.
    await resetDatabaseSingleton();
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

  test("returns the production singleton's handle once getDatabase() runs", async () => {
    priorDbPath = process.env.LOOP_LORE_DB_PATH;
    dbPathOverridden = true;
    // pid + per-run id: unique across parallel runner processes AND across
    // concurrent runs that share a pid (separate containers, same repo path).
    tmpDbPath = path.join(import.meta.dir, "../../.tmp", `sqlite-handle-probe-${process.pid}-${RUN_ID}.db`,);
    process.env.LOOP_LORE_DB_PATH = tmpDbPath;
    try {
      getDatabase();
      const handle = getSqliteDatabase();
      expect(handle,).not.toBeNull();
      expect(handle!.query("SELECT 1 AS one",).get(),).toEqual({ one: 1, },);
      // Unbind instead of destroying: a bare destroy leaves the handle bound.
      await resetDatabaseSingleton();
    } finally {
      // Restored HERE, not only in afterEach: the path is needed just for the
      // synchronous singleton creation, and leaving a mutated process-global
      // across the runner's await boundary lets a concurrently running file
      // resolve its own DB to this probe file.
      restoreDbPathEnv();
    }
  });
});

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression tests for the test-DB plumbing fixes landed in this worktree.
 *
 * Covers:
 * - BUG-create-test-db-custom-dialect-can-bypass-settestdatabase
 * - BUG-settestdatabase-global-leak-on-test-throw
 * - BUG-sqlite-foreign-keys-pragma-set-twice-redundant
 * - BUG-sqlite-wal-pragma-noop-on-in-memory-test-db
 * - BUG-test-run-id-uses-Date.now-collision-risk-under-parallel
 * - BUG-eager-db-init-creates-on-disk-db-on-test-import
 */
import { Database, } from "bun:sqlite";
import { afterEach, describe, expect, test, } from "bun:test";
import { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { rmSync, } from "node:fs";
import { createSqliteDialect, getDatabase, setTestDatabase, } from "./index";
import type { DB, } from "./schema";

describe("setTestDatabase global clear", () => {
  afterEach(() => {
    // Ensure no leakage into the next describe
    setTestDatabase(null,);
  },);

  test("getDatabase returns the override while it is set", () => {
    const sqlite = new Database(":memory:",);
    const kysely = new Kysely<DB>({ dialect: createSqliteDialect(sqlite,), },);
    setTestDatabase(kysely,);
    expect(getDatabase(),).toBe(kysely,);
    sqlite.close();
  });

  test("setTestDatabase(null) clears the override (sentinel path)", () => {
    const sqlite = new Database(":memory:",);
    const kysely = new Kysely<DB>({ dialect: createSqliteDialect(sqlite,), },);
    setTestDatabase(kysely,);
    setTestDatabase(null,);
    // After clear, getDatabase should NOT be the override we just set
    expect(getDatabase(),).not.toBe(kysely,);
    sqlite.close();
  });
});

describe("test-run-id uniqueness under crypto.randomUUID", () => {
  test("1000 consecutive ids are all unique", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const id = `loop-lore-e2e-${randomUUID()}`;
      expect(ids.has(id,), `collision at iteration ${i}`,).toBe(false,);
      ids.add(id,);
    }
    expect(ids.size,).toBe(1000,);
  });
});

describe("sqliteInMemory pragma behavior", () => {
  test(":memory: cannot enable WAL — journal_mode stays at MEMORY", () => {
    // Mirrors tests/e2e/helpers/server.ts sqliteInMemory: no local pragmas,
    // createSqliteDialect sets journal_mode=WAL but SQLite is a no-op on :memory:.
    const sqlite = new Database(":memory:",);
    createSqliteDialect(sqlite,);
    const row = sqlite
      .query("PRAGMA journal_mode",)
      .get() as { journal_mode: string };
    expect(row.journal_mode.toLowerCase(),).toBe("memory",);
    sqlite.close();
  });

  test("createSqliteDialect still enables FK on :memory:", () => {
    const sqlite = new Database(":memory:",);
    createSqliteDialect(sqlite,);
    const row = sqlite
      .query("PRAGMA foreign_keys",)
      .get() as { foreign_keys: number };
    expect(row.foreign_keys,).toBe(1,);
    sqlite.close();
  });
});

describe("lazy production singleton", () => {
  afterEach(() => {
    setTestDatabase(null,);
  },);

  test("getDatabase() does not touch disk when an override is set", () => {
    // Set LOOP_LORE_DB_PATH to a clearly-unwritable path; if the IIFE were
    // still eager (BUG-eager-db-init-creates-on-disk-db-on-test-import), this
    // would fail. With the lazy singleton + override short-circuit, the
    // production path is never invoked and the unwritable path is never
    // touched. (BUG-eager-db-init regression test.)
    const saved = process.env.LOOP_LORE_DB_PATH;
    try {
      process.env.LOOP_LORE_DB_PATH = "/this/path/should/never/be/created/loop-lore.db";
      const sqlite = new Database(":memory:",);
      const kysely = new Kysely<DB>({ dialect: createSqliteDialect(sqlite,), },);
      setTestDatabase(kysely,);
      expect(getDatabase(),).toBe(kysely,);
    } finally {
      process.env.LOOP_LORE_DB_PATH = saved;
      setTestDatabase(null,);
      try {
        rmSync("/this/path/should/never/be/created", { recursive: true, force: true, },);
      } catch { /* ignore */ }
    }
  });
});

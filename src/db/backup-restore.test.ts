// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import { Database, } from "bun:sqlite";
import { afterAll, beforeEach, describe, expect, test, } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLogger, } from "../logger";
import {
  createDbBackup,
  hasSqliteHeader,
  listDbBackups,
  resolveBackupPath,
  restoreDbBackup,
} from "./backup-restore";

try {
  createLogger({ level: "error", },);
} catch {
  /* already initialized */
}

function makeDb(filePath: string,): Database {
  const db = new Database(filePath,);
  db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);",);
  return db;
}

function insertUser(db: Database, id: number, name: string,): void {
  db.prepare("INSERT INTO users (id, name) VALUES (?, ?)",).run(id, name,);
}

function readUsers(filePath: string,): Array<{ id: number; name: string }> {
  const db = new Database(filePath, { readonly: true, },);
  try {
    return db.query("SELECT id, name FROM users ORDER BY id",).all() as Array<{ id: number; name: string }>;
  } finally {
    db.close();
  }
}

describe("db backup/restore service", () => {
  let dir: string;
  let livePath: string;
  let db: Database;

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "db-backup-test-",),);
    livePath = path.join(dir, "live", "live.db",);
    mkdirSync(path.dirname(livePath,), { recursive: true, },);
    db = makeDb(livePath,);
  },);

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true, },);
  },);

  test("createDbBackup writes a snapshot that opens with expected tables and rows", async () => {
    insertUser(db, 1, "ada",);
    insertUser(db, 2, "grace",);

    const result = await createDbBackup({ sqlite: db, dir, },);

    expect(existsSync(result.path,),).toBe(true,);
    expect(result.name,).toMatch(/^loop-lore-.*\.db$/,);
    expect(result.sizeBytes,).toBeGreaterThan(0,);
    expect(readUsers(result.path,),).toEqual([
      { id: 1, name: "ada", },
      { id: 2, name: "grace", },
    ],);

    // Snapshot is independent: rows added after the backup are not in it.
    insertUser(db, 3, "linus",);
    expect(readUsers(result.path,).length,).toBe(2,);
  });

  test("hasSqliteHeader accepts a real db and rejects text/truncated files", () => {
    insertUser(db, 1, "ada",);
    const backup = path.join(dir, "snapshot.db",);
    db.prepare("VACUUM INTO ?",).run(backup,);
    expect(hasSqliteHeader(backup,),).toBe(true,);

    const text = path.join(dir, "not-a-db.db",);
    writeFileSync(text, "definitely not a sqlite database",);
    expect(hasSqliteHeader(text,),).toBe(false,);

    const truncated = path.join(dir, "truncated.db",);
    writeFileSync(truncated, "SQL",);
    expect(hasSqliteHeader(truncated,),).toBe(false,);

    expect(hasSqliteHeader(path.join(dir, "missing.db",),),).toBe(false,);
  });

  test("listDbBackups returns name/size/mtime sorted ascending, ignoring junk", async () => {
    expect(listDbBackups(dir,),).toEqual([],);
    writeFileSync(path.join(dir, "notes.txt",), "ignored",);
    const first = await createDbBackup({ sqlite: db, dir, now: new Date("2026-01-01T00:00:00Z",), },);
    const second = await createDbBackup({ sqlite: db, dir, now: new Date("2026-01-02T00:00:00Z",), },);
    const listed = listDbBackups(dir,);
    expect(listed.map((b,) => b.name),).toEqual([first.name, second.name,],);
    for (const entry of listed) {
      expect(entry.sizeBytes,).toBeGreaterThan(0,);
      expect(entry.modifiedAt,).toBe(entry.modifiedAt,);
      expect(Number.isNaN(Date.parse(entry.modifiedAt,),),).toBe(false,);
    }
  });

  test("resolveBackupPath rejects traversal, separators and missing files", () => {
    expect(() => resolveBackupPath(dir, "../escape.db",)).toThrow();
    expect(() => resolveBackupPath(dir, "sub/dir.db",)).toThrow();
    expect(() => resolveBackupPath(dir, "nope.db",)).toThrow();
    const created = path.join(dir, "ok.db",);
    writeFileSync(created, "x",);
    expect(resolveBackupPath(dir, "ok.db",),).toBe(created,);
  });

  test("restoreDbBackup replaces the live file with the snapshot after close", async () => {
    insertUser(db, 1, "original",);
    const backup = await createDbBackup({ sqlite: db, dir, },);

    // Live db moves on after the backup was taken.
    insertUser(db, 2, "post-backup",);
    const otherDir = mkdtempSync(path.join(os.tmpdir(), "db-restore-test-",),);
    try {
      const otherLive = path.join(otherDir, "live.db",);
      const otherDb = makeDb(otherLive,);
      insertUser(otherDb, 99, "to-be-replaced",);

      let closed = false;
      const result = await restoreDbBackup({
        backupPath: backup.path,
        livePath: otherLive,
        sqlite: otherDb,
        dir,
        closeDb: async () => {
          closed = true;
          otherDb.close();
        },
      },);

      expect(closed,).toBe(true,);
      expect(result.preRestoreBackup,).toMatch(/\.db$/,);
      // Live file now holds the snapshot's data, not the pre-restore rows.
      expect(readUsers(otherLive,),).toEqual([{ id: 1, name: "original", },],);
      // Rollback snapshot of the replaced state exists in the backup dir.
      const preRestore = path.join(dir, result.preRestoreBackup,);
      expect(hasSqliteHeader(preRestore,),).toBe(true,);
      expect(readUsers(preRestore,),).toEqual([{ id: 99, name: "to-be-replaced", },],);
    } finally {
      rmSync(otherDir, { recursive: true, force: true, },);
    }
  });

  test("restoreDbBackup refuses non-sqlite targets without touching live data", async () => {
    insertUser(db, 1, "safe",);
    const fake = path.join(dir, "fake.db",);
    writeFileSync(fake, "not sqlite",);
    await expect(restoreDbBackup({
      backupPath: fake,
      livePath,
      sqlite: db,
      dir,
      closeDb: async () => undefined,
    },),).rejects.toThrow(/not a SQLite database/,);

    expect(readUsers(livePath,),).toEqual([{ id: 1, name: "safe", },],);
  });
});

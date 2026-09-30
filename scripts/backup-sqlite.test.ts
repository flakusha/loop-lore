// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for scripts/backup-sqlite.ts — the `VACUUM INTO` snapshot taken while
 * the app is writing, and for the row-count comparison in
 * scripts/validate-backup-restore.ts that `PRAGMA integrity_check` cannot do.
 * See BUG-backup-sqlite-copies-live-db-without-checkpoint.
 */

import { Database, } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { copyFileSync, existsSync, mkdtempSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { createSnapshot, } from "./backup-sqlite";
import { compareRowCounts, } from "./validate-backup-restore";

const SEED_ROWS = 200;
const CONCURRENT_ROWS = 200;
const BODY_PAD = "x".repeat(512,);

let workDir = "";
let sourcePath = "";

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "backup-sqlite-",),);
  sourcePath = join(workDir, "source.db",);
  seedSource(sourcePath,);
},);

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true, },);
},);

function seedSource(path: string,): void {
  const db = new Database(path, { create: true, },);
  try {
    db.exec("PRAGMA journal_mode = WAL;",);
    db.exec("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL);",);
    const insert = db.query("INSERT INTO notes (id, body) VALUES (?, ?);",);
    for (let id = 1; id <= SEED_ROWS; id++) {
      insert.run(id, `seed-${id}-${BODY_PAD}`,);
    }
  } finally {
    db.close();
  }
}

/** Copies the snapshot aside and opens the copy — an operator's restore. */
function restoreFrom(backupPath: string, name: string,): Database {
  const restorePath = join(workDir, name,);
  copyFileSync(backupPath, restorePath,);
  return new Database(restorePath,);
}

function countRows(db: Database, from: string,): number {
  const row = db.query<{ total: number }>(`SELECT count(*) AS total FROM ${from}`,).get();
  return row?.total ?? 0;
}

function integrityCheck(db: Database,): string | null {
  return db.query<{ integrity_check: string }>("PRAGMA integrity_check;",).get()?.integrity_check ?? null;
}

describe("createSnapshot", () => {
  test("an idle source restores to a clean database with matching row counts", async () => {
    const backupPath = join(workDir, "backup_idle.db",);
    await createSnapshot(sourcePath, backupPath,);

    const restored = restoreFrom(backupPath, "restored_idle.db",);
    expect(integrityCheck(restored,),).toBe("ok",);
    expect(countRows(restored, "notes",),).toBe(SEED_ROWS,);
    expect(compareRowCounts(sourcePath, restored,),).toEqual([],);
    restored.close();
  });

  test("a backup taken while the app writes keeps the WAL-only schema and its rows", async () => {
    const backupPath = join(workDir, "backup_live.db",);
    // The app connection stays open, so `live_notes` and its rows live only in
    // the WAL. That is the state a copyFileSync(db) + copyFileSync(-wal) backup
    // loses when a checkpoint lands between the two copies: on this build that
    // path restored 3/3 trials without the table at all while `PRAGMA
    // integrity_check` still answered "ok".
    const app = new Database(sourcePath,);
    app.exec("CREATE TABLE live_notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL);",);
    const insert = app.query("INSERT INTO live_notes (id, body) VALUES (?, ?);",);
    for (let id = 1; id <= SEED_ROWS; id++) {
      insert.run(id, `seed-${id}-${BODY_PAD}`,);
    }

    const snapshot = createSnapshot(sourcePath, backupPath,);
    let liveWritten = 0;
    for (let id = SEED_ROWS + 1; id <= SEED_ROWS + CONCURRENT_ROWS; id++) {
      insert.run(id, `live-${id}-${BODY_PAD}`,);
      liveWritten++;
    }
    app.exec("PRAGMA wal_checkpoint(PASSIVE);",);
    await snapshot;
    app.close();

    const restored = restoreFrom(backupPath, "restored_live.db",);
    expect(integrityCheck(restored,),).toBe("ok",);
    // The snapshot lands somewhere between the seed and the live commits, so
    // assert the bounds plus the invariants the ticket turned on: the table is
    // queryable and every row committed before the backup started is in it.
    expect(countRows(restored, "live_notes",),).toBeGreaterThanOrEqual(SEED_ROWS,);
    expect(countRows(restored, "live_notes",),).toBeLessThanOrEqual(SEED_ROWS + liveWritten,);
    expect(countRows(restored, "notes",),).toBe(SEED_ROWS,);
    expect(restored.query("SELECT body FROM live_notes WHERE id = 1;",).get(),).not.toBeNull();
    restored.close();
  });

  test("a missing source throws instead of reporting a backup", async () => {
    const backupPath = join(workDir, "backup_broken.db",);
    await expect(createSnapshot(join(workDir, "missing.db",), backupPath,),).rejects.toThrow();
    expect(existsSync(backupPath,),).toBe(false,);
  });
});

describe("compareRowCounts", () => {
  test("reports a table the backup is missing, which integrity_check cannot see", async () => {
    const backupPath = join(workDir, "backup_stale.db",);
    await createSnapshot(sourcePath, backupPath,);

    const source = new Database(sourcePath,);
    try {
      source.exec("CREATE TABLE later_added (id INTEGER PRIMARY KEY);",);
    } finally {
      source.close();
    }

    const restored = restoreFrom(backupPath, "restored_stale.db",);
    expect(integrityCheck(restored,),).toBe("ok",);
    expect(compareRowCounts(sourcePath, restored,),).toEqual(["later_added: missing from the backup",],);
    restored.close();
  });

  test("quotes table names that need it", () => {
    const restored = new Database(sourcePath,);
    try {
      restored.exec('CREATE TABLE "od""d" (id INTEGER PRIMARY KEY);',);
      // Identical schemas, so a correct quote/escape of the odd identifier is
      // the only way this returns no mismatches instead of throwing SQL.
      expect(compareRowCounts(sourcePath, restored,),).toEqual([],);
    } finally {
      restored.close();
    }
  });

  test("reports a table the source no longer has", () => {
    const restored = new Database(join(workDir, "orphan.db",), { create: true, },);
    try {
      restored.exec("CREATE TABLE dropped (id INTEGER PRIMARY KEY);",);
      expect(compareRowCounts(sourcePath, restored,),).toEqual([
        "dropped: present in the backup but absent from the source",
        "notes: missing from the backup",
      ],);
    } finally {
      restored.close();
    }
  });
});

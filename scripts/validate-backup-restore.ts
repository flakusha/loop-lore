// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { spawnSync, } from "bun";
import { Database, } from "bun:sqlite";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, } from "node:fs";
import { join, } from "node:path";

// ponytail: repo-local scratch, resolved from the script dir because cron/systemd
// run these with an arbitrary cwd. Set BACKUP_DIR/VALIDATION_DIR for operator paths.
export const REPO_TMP = join(import.meta.dir, "..", ".tmp",);
export const BACKUP_DIR = process.env.BACKUP_DIR ?? join(REPO_TMP, "backups",);
const SOURCE_DB_PATH = process.env.DB_PATH ?? "/data/loop-lore.db";

function log(msg: string,): void {
  console.error(msg,);
}

function runOrExit(args: string[],): Buffer {
  const proc = spawnSync(args, { stdout: "pipe", stderr: "pipe", },);
  if (proc.exitCode !== 0) {
    const stderr = new TextDecoder().decode(proc.stderr as Buffer,).trim();
    throw new Error(`command failed: ${args.join(" ",)}${stderr ? `: ${stderr}` : ""}`,);
  }
  return proc.stdout as Buffer;
}

function tableNames(db: Database,): string[] {
  return db.query<{ name: string }, []>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name;",
  ).all().map((row,) => row.name);
}

function rowCount(db: Database, table: string,): number {
  const row = db.query<{ total: number }, []>(`SELECT count(*) AS total FROM "${table.replaceAll('"', '""',)}"`,).get();
  return row?.total ?? 0;
}

/**
 * Compares the restored backup against the live source. `integrity_check` only
 * proves page structure, so a backup missing whole tables -- the failure in
 * BUG-backup-sqlite-copies-live-db-without-checkpoint -- passes it. A backup
 * predating the source legitimately holds fewer rows, so only missing tables
 * and surplus counts are reported.
 * @throws Error if either database cannot be opened or queried.
 */
export function compareRowCounts(sourcePath: string, restored: Database,): string[] {
  const source = new Database(sourcePath, { readonly: true, },);
  try {
    const sourceTables = tableNames(source,);
    const restoredTables = tableNames(restored,);
    const mismatches: string[] = [];
    for (const table of restoredTables) {
      if (!sourceTables.includes(table,)) {
        mismatches.push(`${table}: present in the backup but absent from the source`,);
        continue;
      }
      const backupRows = rowCount(restored, table,);
      const sourceRows = rowCount(source, table,);
      if (backupRows > sourceRows) {
        mismatches.push(`${table}: backup has ${backupRows} rows, source has ${sourceRows}`,);
      }
    }
    for (const table of sourceTables) {
      if (!restoredTables.includes(table,)) {
        mismatches.push(`${table}: missing from the backup`,);
      }
    }
    return mismatches;
  } finally {
    source.close();
  }
}

function runValidation(): void {
  // A fixed global name lets concurrent runs wipe each other's decrypted DB;
  // mkdtemp gives each invocation its own private dir under the repo scratch.
  mkdirSync(REPO_TMP, { recursive: true, },);
  const validationDir = process.env.VALIDATION_DIR ??
    mkdtempSync(join(REPO_TMP, "backup-validation-",),);
  try {
    // Find latest backup
    const allFiles = readdirSync(BACKUP_DIR,)
      .filter((f,) => f.startsWith("backup_",) && f.endsWith(".db.gpg",))
      .map((f,) => ({ name: f, mtime: statSync(join(BACKUP_DIR, f,),).mtimeMs, }))
      .sort((a, b,) => b.mtime - a.mtime);

    if (allFiles.length === 0) {
      throw new Error(`No backup file found in ${BACKUP_DIR}`,);
    }

    const latestBackup = join(BACKUP_DIR, allFiles[0].name,);
    log(`Validating backup: ${latestBackup}`,);

    mkdirSync(validationDir, { recursive: true, },);

    // Step 1: Decrypt
    const decryptedFile = join(validationDir, "decrypted_backup.db",);
    runOrExit([
      "gpg",
      "--batch",
      "--yes",
      "--decrypt",
      "--output",
      decryptedFile,
      latestBackup,
    ],);

    // Step 2: Verify checksum
    const checksumFile = latestBackup.replace(/\.gpg$/, ".sha256",);
    if (existsSync(checksumFile,)) {
      const proc = spawnSync(["sha256sum", "-c", checksumFile,], { stdout: "pipe", stderr: "pipe", },);
      if (proc.exitCode !== 0) {
        throw new Error(`Checksum verification failed for ${latestBackup}`,);
      }
      log("Checksum verified",);
    }

    // Step 3: Database integrity check via bun:sqlite
    const db = new Database(decryptedFile,);
    const integrityResult = db.query<{ integrity_check: string }, []>("PRAGMA integrity_check;",).get();
    if (!integrityResult || integrityResult.integrity_check !== "ok") {
      db.close();
      throw new Error(`Database integrity check failed: ${JSON.stringify(integrityResult,)}`,);
    }
    log("Integrity check passed",);

    // Step 4: Row-count comparison against the live source
    if (!existsSync(SOURCE_DB_PATH,)) {
      log(`Warning: source database not found at ${SOURCE_DB_PATH}; row counts not verified`,);
    } else {
      const mismatches = compareRowCounts(SOURCE_DB_PATH, db,);
      if (mismatches.length > 0) {
        db.close();
        throw new Error(`row-count mismatch: ${mismatches.join("; ",)}`,);
      }
      log("Row counts match the source database",);
    }
    db.close();

    log(`Backup validation passed: ${latestBackup}`,);
  } catch (err) {
    log(`ERROR: validation failed: ${err}`,);
    process.exitCode = 1;
  } finally {
    // Step 5: Cleanup — always, including failed runs (the DB is decrypted).
    rmSync(validationDir, { recursive: true, force: true, },);
  }
}

// CLI guard: only run when executed directly (not when imported).
if (import.meta.main) {
  runValidation();
}

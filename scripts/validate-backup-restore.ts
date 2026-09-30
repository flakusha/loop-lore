// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { spawnSync, } from "bun";
import { Database, } from "bun:sqlite";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, } from "node:fs";
import { join, } from "node:path";

const BACKUP_DIR = process.env.BACKUP_DIR ?? "/tmp";
const VALIDATION_DIR = process.env.VALIDATION_DIR ?? "/tmp/validation";
const SOURCE_DB_PATH = process.env.DB_PATH ?? "/data/loop-lore.db";

function log(msg: string,): void {
  console.error(msg,);
}

function runOrExit(args: string[],): Buffer {
  const proc = spawnSync(args, { stdout: "pipe", stderr: "pipe", },);
  if (proc.exitCode !== 0) {
    log(`ERROR: command failed: ${args.join(" ",)}`,);
    log(new TextDecoder().decode(proc.stderr as Buffer,),);
    process.exit(1,);
  }
  return proc.stdout as Buffer;
}

function tableNames(db: Database,): string[] {
  return db.query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name;",
  ).all().map((row,) => row.name);
}

function rowCount(db: Database, table: string,): number {
  const row = db.query<{ total: number }>(`SELECT count(*) AS total FROM "${table.replaceAll('"', '""',)}"`,).get();
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
  try {
    // Find latest backup
    const allFiles = readdirSync(BACKUP_DIR,)
      .filter((f,) => f.startsWith("backup_",) && f.endsWith(".db.gpg",))
      .map((f,) => ({ name: f, mtime: statSync(join(BACKUP_DIR, f,),).mtimeMs, }))
      .sort((a, b,) => b.mtime - a.mtime);

    if (allFiles.length === 0) {
      log(`ERROR: No backup file found in ${BACKUP_DIR}`,);
      process.exit(1,);
    }

    const latestBackup = join(BACKUP_DIR, allFiles[0].name,);
    log(`Validating backup: ${latestBackup}`,);

    // Prepare validation dir
    if (existsSync(VALIDATION_DIR,)) {
      rmSync(VALIDATION_DIR, { recursive: true, },);
    }
    mkdirSync(VALIDATION_DIR, { recursive: true, },);

    // Step 1: Decrypt
    const decryptedFile = join(VALIDATION_DIR, "decrypted_backup.db",);
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
        log(`ERROR: Checksum verification failed for ${latestBackup}`,);
        process.exit(1,);
      }
      log("Checksum verified",);
    }

    // Step 3: Database integrity check via bun:sqlite
    const db = new Database(decryptedFile,);
    const integrityResult = db.query<{ integrity_check: string }>("PRAGMA integrity_check;",).get();
    if (!integrityResult || integrityResult.integrity_check !== "ok") {
      log(`ERROR: Database integrity check failed: ${JSON.stringify(integrityResult,)}`,);
      db.close();
      process.exit(1,);
    }
    log("Integrity check passed",);

    // Step 4: Row-count comparison against the live source
    if (!existsSync(SOURCE_DB_PATH,)) {
      log(`Warning: source database not found at ${SOURCE_DB_PATH}; row counts not verified`,);
    } else {
      const mismatches = compareRowCounts(SOURCE_DB_PATH, db,);
      if (mismatches.length > 0) {
        for (const mismatch of mismatches) {
          log(`ERROR: row-count mismatch: ${mismatch}`,);
        }
        db.close();
        process.exit(1,);
      }
      log("Row counts match the source database",);
    }
    db.close();

    // Step 5: Cleanup
    rmSync(VALIDATION_DIR, { recursive: true, },);

    log(`Backup validation passed: ${latestBackup}`,);
  } catch (err) {
    log(`ERROR: validation failed: ${err}`,);
    process.exit(1,);
  }
}

// CLI guard: only run when executed directly (not when imported).
if (import.meta.main) {
  runValidation();
}

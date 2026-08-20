// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { spawnSync, } from "bun";
import { Database, } from "bun:sqlite";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, } from "node:fs";
import { join, } from "node:path";

const BACKUP_DIR = process.env.BACKUP_DIR ?? "/tmp";
const VALIDATION_DIR = process.env.VALIDATION_DIR ?? "/tmp/validation";

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
  db.close();

  // Step 4: Cleanup
  rmSync(VALIDATION_DIR, { recursive: true, },);

  log(`Backup validation passed: ${latestBackup}`,);
} catch (err) {
  log(`ERROR: validation failed: ${err}`,);
  process.exit(1,);
}

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { spawnSync, } from "bun";
import { Database, } from "bun:sqlite";
import { copyFileSync, existsSync, readdirSync, statSync, unlinkSync, writeFileSync, } from "node:fs";
import { basename, join, } from "node:path";

const BACKUP_DIR = process.env.BACKUP_DIR ?? "/tmp";
const DB_PATH = process.env.DB_PATH ?? "/data/loop-lore.db";
const NETWORK_MOUNT = process.env.NETWORK_MOUNT ?? "/mnt/backups/db";
const RETENTION_DAYS = parseInt(process.env.RETENTION_DAYS ?? "7", 10,);
const GPG_RECIPIENT = process.env.GPG_RECIPIENT ?? "backup@loop-lore.local";

const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-",);
const BACKUP_BASE = join(BACKUP_DIR, `backup_${TIMESTAMP}.db`,);
const ENCRYPTED_FILE = `${BACKUP_BASE}.gpg`;
const CHECKSUM_FILE = `${BACKUP_BASE}.sha256`;

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
  log(`Starting backup: ${TIMESTAMP}`,);

  // Step 1: Snapshot the database
  if (!existsSync(DB_PATH,)) {
    log(`ERROR: database not found at ${DB_PATH}`,);
    process.exit(1,);
  }
  // `VACUUM INTO` takes SQLite's own read snapshot, so the result is a
  // consistent single-file database with no WAL sidecars even while the app is
  // writing. Do NOT replace this with copyFileSync + copyFileSync(-wal): a
  // checkpoint landing between the two copies folds WAL frames into the main
  // file and resets the WAL, leaving the copied pair missing data that was
  // committed -- observed as a restore with no schema at all. See
  // BUG-backup-sqlite-copies-live-db-without-checkpoint.
  //
  // A failed snapshot leaves a truncated BACKUP_BASE behind, and step 6's
  // retention sweep matches it on the `backup_` prefix -- so the partial file
  // would be retained and age like a good backup, and an operator restoring
  // from it would get a corrupt database with no error anywhere. Remove it.
  const source = new Database(DB_PATH, { readonly: true, },);
  try {
    await source.query(`VACUUM INTO '${BACKUP_BASE.replaceAll("'", "''",)}'`,).run();
  } catch (err) {
    if (existsSync(BACKUP_BASE,)) {
      try {
        unlinkSync(BACKUP_BASE,);
      } catch { /* best effort; the throw below still fails the run */ }
    }
    throw err;
  } finally {
    source.close();
  }

  // Step 2: Compress
  const compressArgs = ["tar", "-czf", `${BACKUP_BASE}.tar.gz`, "-C", BACKUP_DIR, basename(BACKUP_BASE,),];
  const tarProc = spawnSync(compressArgs, { stdout: "pipe", stderr: "pipe", },);
  if (tarProc.exitCode !== 0) {
    log(`Warning: compression skipped (${new TextDecoder().decode(tarProc.stderr as Buffer,).trim()})`,);
  }

  // Step 3: Encrypt
  log(`Encrypting with GPG recipient: ${GPG_RECIPIENT}`,);
  runOrExit([
    "gpg",
    "--batch",
    "--yes",
    "--encrypt",
    "--recipient",
    GPG_RECIPIENT,
    "--output",
    ENCRYPTED_FILE,
    BACKUP_BASE,
  ],);

  // Step 4: Checksum
  const shaOut = runOrExit(["sha256sum", ENCRYPTED_FILE,],);
  writeFileSync(CHECKSUM_FILE, new TextDecoder().decode(shaOut,).trim() + "\n",);

  // Step 5: Push to network mount
  if (existsSync(NETWORK_MOUNT,)) {
    copyFileSync(ENCRYPTED_FILE, join(NETWORK_MOUNT, basename(ENCRYPTED_FILE,),),);
    copyFileSync(CHECKSUM_FILE, join(NETWORK_MOUNT, basename(CHECKSUM_FILE,),),);
    log(`Backup pushed to ${NETWORK_MOUNT}`,);
  } else {
    log(`Warning: Network mount not available at ${NETWORK_MOUNT}`,);
  }

  // Step 6: Cleanup old backups
  const cutoffMs = Date.now() - RETENTION_DAYS * 86_400_000;
  for (const dir of [BACKUP_DIR, NETWORK_MOUNT,]) {
    if (!existsSync(dir,)) { continue; }
    for (const entry of readdirSync(dir,)) {
      if (!entry.startsWith("backup_",)) { continue; }
      const fullPath = join(dir, entry,);
      try {
        if (statSync(fullPath,).mtimeMs < cutoffMs) {
          unlinkSync(fullPath,);
        }
      } catch { /* race, skip */ }
    }
  }

  log(`Backup completed: ${TIMESTAMP}`,);
} catch (err) {
  log(`ERROR: backup failed: ${err}`,);
  process.exit(1,);
}

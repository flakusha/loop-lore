// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import { Database, } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import { resolveDbPath, resolveInstanceSlug, type ServerBind, } from "../config/state-dir";
import { getLogger, } from "../logger";
import type { Logger, } from "../logger";
import { archiveDir, } from "./reinit-archive";

/** Magic bytes every SQLite 3 database file starts with. */
const SQLITE_HEADER = "SQLite format 3\0";
const HEADER_LENGTH = 16;
const BACKUP_EXTENSION = ".db";

/** Minimal raw `bun:sqlite` surface the service needs (test-friendly). */
export interface RawSqlite {
  run(sql: string, ...params: unknown[]): unknown;
}

/** One backup file as reported by the list endpoint. */
export interface BackupFileMeta {
  name: string;
  sizeBytes: number;
  modifiedAt: string;
}

export interface CreateDbBackupOpts {
  sqlite: RawSqlite;
  dir: string;
  /** Injectable clock for deterministic test filenames. */
  now?: Date;
}

export interface CreateDbBackupResult {
  name: string;
  path: string;
  sizeBytes: number;
}

export interface RestoreDbBackupOpts {
  backupPath: string;
  livePath: string;
  /** Open connection to the LIVE database, used for the pre-restore snapshot. */
  sqlite: RawSqlite;
  dir: string;
  /** Closes the live Kysely/bun:sqlite handles before the file is replaced. */
  closeDb: () => Promise<void>;
}

/**
 * Resolve the backup directory for database snapshots. Lives under this
 * instance's archive root (backup-dir env override / instance-dir `backups/`)
 * in a `db/` subtree so file archives and db snapshots never collide.
 * @returns the directory database backups are written to
 */
export function dbBackupDir(): string {
  return path.join(archiveDir(), "db",);
}

/**
 * Resolve the live database file path, mirroring `src/db/index.ts` singleton
 * resolution (explicit path env override beats the XDG per-instance default).
 * @param server - resolved server bind (loaded config.server); omit when unconfigured
 * @returns the live SQLite database file path
 */
export function liveDbPath(server?: ServerBind,): string {
  return resolveDbPath(process.env, server,);
}

/**
 * Read the first bytes of `p` and check the SQLite 3 magic header.
 * @param p - candidate file path
 * @returns true when the file starts with the SQLite 3 magic string
 */
export function hasSqliteHeader(p: string,): boolean {
  if (!fs.existsSync(p,)) { return false; }
  const fd = fs.openSync(p, "r",);
  try {
    const buf = Buffer.alloc(HEADER_LENGTH,);
    const read = fs.readSync(fd, buf, 0, HEADER_LENGTH, 0,);
    return read === HEADER_LENGTH && buf.toString("latin1", 0, HEADER_LENGTH,) === SQLITE_HEADER;
  } finally {
    fs.closeSync(fd,);
  }
}

/** Thrown when a snapshot is structurally unusable for restore. */
export class InvalidSnapshotError extends Error {
  constructor(message: string,) {
    super(message,);
    this.name = "InvalidSnapshotError";
  }
}

/**
 * Stronger pre-restore validation than the magic-header check: require a
 * passing `PRAGMA integrity_check`, at least one user table, and the loop-lore
 * migration/chat/message tables so a foreign SQLite file cannot replace the
 * live DB.
 * @throws InvalidSnapshotError (path-free message) when the file is unusable
 */
export function validateSqliteSnapshot(p: string,): void {
  let db: Database;
  try {
    db = new Database(p, { readonly: true, },);
  } catch {
    throw new InvalidSnapshotError("Snapshot is not a readable SQLite database",);
  }

  try {
    const integrity = db.query<{ integrity_check: string }, []>("PRAGMA integrity_check;",).get();
    if (integrity?.integrity_check !== "ok") {
      throw new InvalidSnapshotError("Snapshot failed SQLite integrity check",);
    }

    const tables = new Set(
      db.query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';",
      ).all().map((row,) => row.name),
    );

    if (tables.size === 0) {
      throw new InvalidSnapshotError("Snapshot has no user tables",);
    }

    if (["kysely_migration", "chats", "messages",].some((name,) => !tables.has(name,))) {
      throw new InvalidSnapshotError("Snapshot is not a loop-lore database",);
    }

    const applied = db.query<{ count: number }, []>(
      "SELECT COUNT(*) AS count FROM kysely_migration;",
    ).get()?.count ?? 0;

    if (applied === 0) {
      throw new InvalidSnapshotError("Snapshot has no applied migrations",);
    }
  } catch (err) {
    if (err instanceof InvalidSnapshotError) { throw err; }
    throw new InvalidSnapshotError("Snapshot is not a valid SQLite database",);
  } finally {
    db.close();
  }
}

function log(): Logger {
  return getLogger().child({ module: "db-backup", },);
}

/**
 * Write a consistent snapshot of the live database via SQLite `VACUUM INTO`.
 * The statement serializes against writers, so the snapshot is a
 * point-in-time copy taken under SQLite's own locking — no separate
 * checkpoint dance is needed.
 * @throws when SQLite cannot execute the VACUUM (locked db, unwritable dir)
 * @throws when the produced file fails its own header check
 */
export async function createDbBackup(opts: CreateDbBackupOpts,): Promise<CreateDbBackupResult> {
  const { sqlite, dir, } = opts;
  fs.mkdirSync(dir, { recursive: true, },);
  const stamp = (opts.now ?? new Date()).toISOString().replace(/[:.]/g, "-",);
  // The slug keeps two instances' snapshots apart even when they share a
  // backup volume.
  const slug = resolveInstanceSlug(process.env,);
  let name = `loop-lore-${slug}-${stamp}${BACKUP_EXTENSION}`;
  let seq = 0;
  while (fs.existsSync(path.join(dir, name,),)) {
    seq += 1;
    name = `loop-lore-${slug}-${stamp}-${String(seq,).padStart(2, "0",)}${BACKUP_EXTENSION}`;
  }

  const target = path.join(dir, name,);
  sqlite.run("VACUUM INTO ?", target,);
  if (!hasSqliteHeader(target,)) {
    throw new Error(`Backup file ${name} failed SQLite header verification`,);
  }

  const sizeBytes = fs.statSync(target,).size;
  log().info("Database backup written", { name, sizeBytes, },);
  return { name, path: target, sizeBytes, };
}

/**
 * List database backup files in `dir` with size + mtime, oldest last.
 * Non-`.db` entries are ignored; unreadable entries are skipped.
 * @returns backup file metadata sorted by mtime ascending
 */
export function listDbBackups(dir: string,): BackupFileMeta[] {
  if (!fs.existsSync(dir,)) { return []; }
  const entries: BackupFileMeta[] = [];
  for (const name of fs.readdirSync(dir,)) {
    if (!name.endsWith(BACKUP_EXTENSION,)) { continue; }
    const full = path.join(dir, name,);
    try {
      const st = fs.statSync(full,);
      if (!st.isFile()) { continue; }
      entries.push({
        name,
        sizeBytes: st.size,
        modifiedAt: st.mtime.toISOString(),
      },);
    } catch {
      /* file vanished between readdir and stat — skip */
    }
  }

  return entries.sort((a, b,) => {
    const byTime = a.modifiedAt.localeCompare(b.modifiedAt,);
    return byTime !== 0 ? byTime : a.name.localeCompare(b.name,);
  },);
}

/**
 * Retention prune for file snapshots: keep the newest `keep` `.db` files in
 * `dir` (by mtime then name, oldest first from {@link listDbBackups}) and
 * delete the rest. Returns the number deleted. Missing dirs and files that
 * vanish between listing and unlink are no-ops — pruning never breaks the
 * host flow.
 * @param dir - server-derived backup directory
 * @param keep - maximum snapshots to retain; <= 0 deletes all
 * @returns number of snapshot files removed
 */
export function pruneDbSnapshots(dir: string, keep: number,): number {
  const backups = listDbBackups(dir,);
  const stale = keep <= 0 ? backups : backups.slice(0, Math.max(backups.length - keep, 0,),);
  let deleted = 0;
  for (const entry of stale) {
    try {
      fs.unlinkSync(path.join(dir, entry.name,),);
      deleted += 1;
    } catch {
      /* file vanished between list and unlink — nothing to do */
    }
  }

  return deleted;
}

/**
 * Resolve `name` inside `dir`, rejecting path traversal: names must be bare
 * file names of existing files inside the backup directory.
 * @throws when the name escapes the directory or does not exist
 */
export function resolveBackupPath(dir: string, name: string,): string {
  if (name.includes("/",) || name.includes("\\",) || name.includes("..",)) {
    throw new Error("Invalid backup name",);
  }

  const base = path.resolve(dir,);
  const resolved = path.resolve(dir, name,);
  if (path.dirname(resolved,) !== base) {
    throw new Error("Invalid backup name",);
  }

  // A bare name may still be a symlink pointing outside the backup directory.
  // Resolve symlinks on both sides and re-check containment before returning.
  let realBase: string;
  let realTarget: string;
  try {
    realBase = fs.realpathSync(base,);
    realTarget = fs.realpathSync(resolved,);
  } catch (error) {
    // ENOENT means missing; other FS errors are reported generically so raw
    // absolute paths never reach callers.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Backup "${name}" not found`,);
    }

    throw new Error("Invalid backup name",);
  }

  if (path.dirname(realTarget,) !== realBase) {
    throw new Error("Invalid backup name",);
  }

  return realTarget;
}

/**
 * Restore a validated snapshot over the live database file.
 *
 * DESIGN DECISION (documented on the ticket): a true in-place restore is
 * unsafe in-process. Routes and services capture the Kysely `Db` handle at
 * registration, so closing the singleton would leave live references to a
 * destroyed connection; replacing the file while a connection is open leaves
 * that connection writing to the unlinked inode. The safe sequence here is:
 * 1. snapshot the CURRENT live db (rollback path),
 * 2. validate the target snapshot (SQLite magic header, integrity_check, user tables),
 * 3. close the live handles (checkpoint/flush),
 * 4. atomically rename the snapshot over the live path (stale `-wal`/`-shm`
 *    sidecars are removed first).
 * After the close, previously captured handles are dead: the process must be
 * restarted to serve from the restored database (`restartRequired: true` in
 * the route response). This is an explicit, documented limitation — not a
 * silent fake success.
 * @throws InvalidSnapshotError when the target snapshot fails validation
 * @throws when replacing the live file fails after the close
 */
export async function restoreDbBackup(opts: RestoreDbBackupOpts,): Promise<{ preRestoreBackup: string }> {
  const { backupPath, livePath, sqlite, dir, closeDb, } = opts;
  if (!hasSqliteHeader(backupPath,)) {
    throw new InvalidSnapshotError("Snapshot is not a SQLite database file",);
  }

  validateSqliteSnapshot(backupPath,);

  // Rollback path first: snapshot the current live data before touching it.
  const pre = await createDbBackup({ sqlite, dir, },);
  await closeDb();
  for (const sidecar of [`${livePath}-wal`, `${livePath}-shm`,]) {
    if (fs.existsSync(sidecar,)) { fs.unlinkSync(sidecar,); }
  }

  const tmp = `${livePath}.restore-tmp`;
  fs.copyFileSync(backupPath, tmp,);
  fs.renameSync(tmp, livePath,);
  log().info("Database restored from backup", { backup: path.basename(backupPath,), preRestoreBackup: pre.name, },);
  return { preRestoreBackup: pre.name, };
}

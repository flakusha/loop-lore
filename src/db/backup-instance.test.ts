// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Instance-scoped backup and archive roots (F11).
 *
 * The backup root used to be the instance dir's SIBLING, so every instance
 * shared one retention pool: one instance's prune pass could delete another
 * instance's rollback point.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import path from "node:path";
import { resolveInstanceDir, } from "../config/state-dir";
import { createLogger, type Logger, } from "../logger";
import { createDbBackup, dbBackupDir, type RawSqlite, } from "./backup-restore";
import { archiveDir, pruneArchives, } from "./reinit-archive";

const noopLog: Logger = { info() {}, warn() {}, debug() {}, error() {}, } as unknown as Logger;
const ENV_STATE = "LOOP_LORE_STATE_DIR";
const ENV_INSTANCE = "LOOP_LORE_INSTANCE";
const ENV_BACKUP = "LOOP_LORE_BACKUP_DIR";

/** A `VACUUM INTO` stub that writes a file with the SQLite magic header. */
const fakeSqlite: RawSqlite = {
  run(_sql: string, ...params: unknown[]): unknown {
    writeFileSync(String(params[0],), "SQLite format 3\0",);
    return undefined;
  },
};

beforeAll(() => {
  // createDbBackup logs through the repo logger.
  createLogger({ level: "error", },);
},);

let savedState: string | undefined;
let savedInstance: string | undefined;
let savedBackup: string | undefined;
let stateRoot = "";

beforeEach(() => {
  savedState = process.env[ENV_STATE];
  savedInstance = process.env[ENV_INSTANCE];
  savedBackup = process.env[ENV_BACKUP];
  delete process.env[ENV_BACKUP];
  stateRoot = mkdtempSync(path.join(tmpdir(), "loop-lore-backup-",),);
  process.env[ENV_STATE] = stateRoot;
  process.env[ENV_INSTANCE] = "alpha";
},);

afterEach(() => {
  if (savedState === undefined) { delete process.env[ENV_STATE]; }
  else { process.env[ENV_STATE] = savedState; }

  if (savedInstance === undefined) { delete process.env[ENV_INSTANCE]; }
  else { process.env[ENV_INSTANCE] = savedInstance; }

  if (savedBackup === undefined) { delete process.env[ENV_BACKUP]; }
  else { process.env[ENV_BACKUP] = savedBackup; }

  rmSync(stateRoot, { recursive: true, force: true, },);
},);

describe("instance-scoped backup root (F11)", () => {
  test("keeps the backup root inside the instance dir", () => {
    expect(dbBackupDir(),).toBe(path.join(stateRoot, "alpha", "backups", "db",),);
    expect(dbBackupDir().startsWith(resolveInstanceDir(process.env,),),).toBe(true,);
  });

  test("gives every instance its own backup dir", () => {
    process.env[ENV_INSTANCE] = "alpha";
    const alpha = dbBackupDir();
    process.env[ENV_INSTANCE] = "beta";
    const beta = dbBackupDir();

    expect(alpha,).not.toBe(beta,);
    expect(beta,).toBe(path.join(stateRoot, "beta", "backups", "db",),);
  });

  test("the backup-dir override is a root, so instances still get their own dir", () => {
    process.env[ENV_BACKUP] = path.join(stateRoot, "shared-volume",);
    process.env[ENV_INSTANCE] = "alpha";
    expect(dbBackupDir(),).toBe(path.join(stateRoot, "shared-volume", "alpha", "db",),);
    process.env[ENV_INSTANCE] = "beta";
    expect(dbBackupDir(),).toBe(path.join(stateRoot, "shared-volume", "beta", "db",),);
  });
});

describe("instance-scoped archive root (F11)", () => {
  test("one instance's retention pass cannot delete another instance's archive", () => {
    process.env[ENV_INSTANCE] = "alpha";
    const alphaDir = archiveDir();
    process.env[ENV_INSTANCE] = "beta";
    const betaDir = archiveDir();

    expect(alphaDir,).not.toBe(betaDir,);
    expect(alphaDir,).toBe(path.join(stateRoot, "alpha", "backups",),);
    expect(betaDir,).toBe(path.join(stateRoot, "beta", "backups",),);

    mkdirSync(alphaDir, { recursive: true, },);
    mkdirSync(betaDir, { recursive: true, },);
    // More archives than the retention cap, so alpha's pass really prunes.
    for (let i = 0; i < 12; i += 1) {
      const stamp = `2026-09-15T10-${String(i,).padStart(2, "0",)}-00-000Z`;
      writeFileSync(path.join(alphaDir, `${stamp}-loop-lore.db`,), "a",);
    }

    const betaArchive = path.join(betaDir, "2026-09-16T10-00-00-000Z-loop-lore.db",);
    writeFileSync(betaArchive, "b",);

    pruneArchives(alphaDir, noopLog,);

    // Alpha's own overflow is pruned...
    expect(existsSync(path.join(alphaDir, "2026-09-15T10-00-00-000Z-loop-lore.db",),),).toBe(false,);
    // ...but beta's rollback point survives.
    expect(existsSync(betaArchive,),).toBe(true,);
  });
});

describe("instance-scoped snapshot names (F11)", () => {
  test("the snapshot filename carries the instance slug", async () => {
    process.env[ENV_INSTANCE] = "alpha";
    const alpha = await createDbBackup({ sqlite: fakeSqlite, dir: dbBackupDir(), },);
    expect(alpha.name.startsWith("loop-lore-alpha-",),).toBe(true,);

    process.env[ENV_INSTANCE] = "beta";
    const beta = await createDbBackup({ sqlite: fakeSqlite, dir: dbBackupDir(), },);
    expect(beta.name.startsWith("loop-lore-beta-",),).toBe(true,);
    expect(beta.name,).not.toBe(alpha.name,);
  });
});

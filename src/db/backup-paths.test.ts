// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the path resolvers (dbBackupDir/liveDbPath env overrides).
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import path from "node:path";
import { dbBackupDir, liveDbPath, } from "./backup-restore";

const ENV_BACKUP = "LOOP_LORE_BACKUP_DIR";
const ENV_DB = "LOOP_LORE_DB_PATH";
const ENV_INSTANCE = "LOOP_LORE_INSTANCE";

let savedBackup: string | undefined;
let savedDb: string | undefined;
let savedInstance: string | undefined;

beforeEach(() => {
  savedBackup = process.env[ENV_BACKUP];
  savedDb = process.env[ENV_DB];
  savedInstance = process.env[ENV_INSTANCE];
  delete process.env[ENV_BACKUP];
  delete process.env[ENV_DB];
  delete process.env[ENV_INSTANCE];
},);

afterEach(() => {
  if (savedBackup === undefined) { delete process.env[ENV_BACKUP]; }
  else { process.env[ENV_BACKUP] = savedBackup; }

  if (savedDb === undefined) { delete process.env[ENV_DB]; }
  else { process.env[ENV_DB] = savedDb; }

  if (savedInstance === undefined) { delete process.env[ENV_INSTANCE]; }
  else { process.env[ENV_INSTANCE] = savedInstance; }
},);

describe("backup path resolvers", () => {
  test("dbBackupDir appends the instance slug and the db subtree to the env root", () => {
    process.env[ENV_BACKUP] = "/tmp/custom-backup-root";
    process.env[ENV_INSTANCE] = "canary";
    expect(dbBackupDir(),).toBe(path.join("/tmp/custom-backup-root", "canary", "db",),);
  });

  test("liveDbPath honors the db path env override", () => {
    process.env[ENV_DB] = "/tmp/custom-live.db";
    expect(liveDbPath(),).toBe("/tmp/custom-live.db",);
  });

  test("defaults resolve under the data dir without env overrides", () => {
    expect(dbBackupDir().endsWith(path.join("db",),),).toBe(true,);
    expect(liveDbPath().endsWith("loop-lore.db",),).toBe(true,);
  });
});

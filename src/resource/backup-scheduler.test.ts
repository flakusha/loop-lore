// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Backup scheduling: three triggers behind an enablement guard; disabled
// by default (no rows), fires when storage is provisioned + enabled,
// skips without throwing on failure.
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, destroyTestDb, } from "../test-utils/create-test-db";
import {
  configureBackupScheduling,
  isBackupSchedulingEnabled,
  resetBackupScheduling,
  scheduleAssetUploadBackup,
  scheduleChatEndBackup,
  scheduleWorldSaveBackup,
} from "./backup-scheduler";
import { addStorageResource, listBackups, registerBackupHook, } from "./external-storage";

let testDb: Kysely<DB>;
let testSqlite: Database;

beforeAll(async () => {
  try {
    createLogger({ level: "error", },);
  } catch { /* already initialized */ }

  const env = await createTestDb();
  testDb = env.db;
  testSqlite = env.sqlite;
},);

afterAll(async () => {
  await destroyTestDb({ db: testDb, sqlite: testSqlite, },);
},);

describe("backup-scheduler", () => {
  test("disabled by default: triggers write no rows", async () => {
    resetBackupScheduling();
    await scheduleChatEndBackup(testDb, { ownerId: "sched-off-user", chatId: "c1", },);
    await scheduleAssetUploadBackup(testDb, { ownerId: "sched-off-user", assetId: "a1", contentHash: "h", },);
    await scheduleWorldSaveBackup(testDb, { ownerId: "sched-off-user", chatId: "c1", payload: "{}", },);
    expect(await listBackups(testDb, "sched-off-user",),).toHaveLength(0,);
  });

  test("enabled without provisioned storage writes no rows", async () => {
    resetBackupScheduling();
    configureBackupScheduling({ enabled: true, },);
    const r = await scheduleChatEndBackup(testDb, { ownerId: "sched-nostore", chatId: "c1", },);
    expect(r,).toEqual({ scheduled: false, reason: "no-storage", },);
    expect(await listBackups(testDb, "sched-nostore",),).toHaveLength(0,);
    resetBackupScheduling();
  });

  test("each trigger fires with enabled + provisioned storage", async () => {
    resetBackupScheduling();
    await addStorageResource(testDb, {
      id: "sched-store-1",
      ownerId: "sched-user",
      kind: "s3",
      endpoint: "https://s3.example.com/b",
      secret: "sk-test",
    },);

    configureBackupScheduling({ enabled: true, },);

    await scheduleChatEndBackup(testDb, { ownerId: "sched-user", chatId: "c1", },);
    await scheduleAssetUploadBackup(testDb, { ownerId: "sched-user", assetId: "a1", contentHash: "h", },);
    await scheduleWorldSaveBackup(testDb, { ownerId: "sched-user", chatId: "c1", payload: '{"save":1}', },);

    const rows = await listBackups(testDb, "sched-user",);
    expect(rows.map((r,) => r.resourceType).sort(),).toEqual(["asset", "chat", "world",],);
    resetBackupScheduling();
  });

  test("per-trigger flag disables one trigger only", async () => {
    resetBackupScheduling();
    await addStorageResource(testDb, {
      id: "sched-store-2",
      ownerId: "sched-flag-user",
      kind: "s3",
      endpoint: "https://s3.example.com/b",
      secret: "sk-test",
    },);

    configureBackupScheduling({ enabled: true, onAssetUpload: false, },);

    await scheduleAssetUploadBackup(testDb, { ownerId: "sched-flag-user", assetId: "a1", contentHash: "h", },);
    await scheduleChatEndBackup(testDb, { ownerId: "sched-flag-user", chatId: "c1", },);

    const rows = await listBackups(testDb, "sched-flag-user",);
    expect(rows.map((r,) => r.resourceType),).toEqual(["chat",],);
    resetBackupScheduling();
  });

  test("hook failure skips without throwing", async () => {
    resetBackupScheduling();
    await addStorageResource(testDb, {
      id: "sched-store-3",
      ownerId: "sched-fail-user",
      kind: "s3",
      endpoint: "https://s3.example.com/b",
      secret: "sk-test",
    },);

    configureBackupScheduling({ enabled: true, },);
    registerBackupHook("onChatEnd", async () => {
      throw new Error("boom",);
    },);

    const r = await scheduleChatEndBackup(testDb, { ownerId: "sched-fail-user", chatId: "c1", },);
    expect(r,).toEqual({ scheduled: false, reason: "failed", },);
    expect(await listBackups(testDb, "sched-fail-user",),).toHaveLength(0,);
    resetBackupScheduling();
  });

  test("isBackupSchedulingEnabled reflects configure/reset state", () => {
    resetBackupScheduling();
    expect(isBackupSchedulingEnabled(),).toBe(false,);
    configureBackupScheduling({ enabled: true, },);
    expect(isBackupSchedulingEnabled(),).toBe(true,);
    resetBackupScheduling();
    expect(isBackupSchedulingEnabled(),).toBe(false,);
  });
});

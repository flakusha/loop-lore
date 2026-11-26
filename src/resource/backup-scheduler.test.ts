// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Backup scheduling: three triggers behind an enablement guard; disabled
// by default (no rows), fires when storage is provisioned + enabled,
// skips without throwing on failure.
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync, } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pruneDbSnapshots, } from "../db/backup-restore";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, destroyTestDb, } from "../test-utils/create-test-db";
import { jsonStringifyOr, } from "../utils";
import {
  configureBackupScheduling,
  isBackupSchedulingEnabled,
  resetBackupScheduling,
  scheduleAssetUploadBackup,
  scheduleChatEndBackup,
  scheduleDbSnapshotBackup,
  scheduleWorldSaveBackup,
} from "./backup-scheduler";
import {
  addStorageResource,
  type BackupHook,
  listBackups,
  registerBackupHook,
} from "./external-storage";

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

  test("owner opt-out (backupEnabled:false) skips while master stays enabled", async () => {
    resetBackupScheduling();
    await testDb.insertInto("users",).values({
      id: "sched-optout-user",
      username: "sched-optout-user",
      display_name: "Opt Out",
      settings: jsonStringifyOr({ backupEnabled: false, },),
    },).execute();

    await addStorageResource(testDb, {
      id: "sched-store-optout",
      ownerId: "sched-optout-user",
      kind: "s3",
      endpoint: "https://s3.example.com/b",
      secret: "sk-test",
    },);

    configureBackupScheduling({ enabled: true, },);
    const r = await scheduleChatEndBackup(testDb, { ownerId: "sched-optout-user", chatId: "c1", },);
    expect(r,).toEqual({ scheduled: false, reason: "disabled", },);
    expect(await listBackups(testDb, "sched-optout-user",),).toHaveLength(0,);
    expect(isBackupSchedulingEnabled(),).toBe(true,);
    resetBackupScheduling();
  });

  test("fail-open: missing owner row still schedules", async () => {
    resetBackupScheduling();
    await addStorageResource(testDb, {
      id: "sched-store-failopen",
      ownerId: "sched-ghost-user",
      kind: "s3",
      endpoint: "https://s3.example.com/b",
      secret: "sk-test",
    },);

    configureBackupScheduling({ enabled: true, },);
    const r = await scheduleChatEndBackup(testDb, { ownerId: "sched-ghost-user", chatId: "c1", },);
    expect(r,).toEqual({ scheduled: true, },);
    expect(await listBackups(testDb, "sched-ghost-user",),).toHaveLength(1,);
    resetBackupScheduling();
  });

  test("chat payload round-trips messages and asset payload carries identifiers", async () => {
    resetBackupScheduling();
    await addStorageResource(testDb, {
      id: "sched-store-payload",
      ownerId: "sched-payload-user",
      kind: "s3",
      endpoint: "https://s3.example.com/b",
      secret: "sk-test",
    },);

    configureBackupScheduling({ enabled: true, },);

    await scheduleChatEndBackup(testDb, {
      ownerId: "sched-payload-user",
      chatId: "c-payload",
      messages: [{ id: "m1", role: "user", content: "hello", },],
    },);

    await scheduleAssetUploadBackup(testDb, {
      ownerId: "sched-payload-user",
      assetId: "a-payload",
      contentHash: "h-payload",
      storagePath: "/tmp/a-payload",
      mimeType: "image/png",
    },);

    const rows = await listBackups(testDb, "sched-payload-user",);
    expect(rows,).toHaveLength(2,);
    const chatRow = rows.find((r,) => r.resourceType === "chat")!;
    const chatPayload = JSON.parse(chatRow.payload,) as { chatId: string; messages: unknown[] };
    expect(chatPayload.chatId,).toBe("c-payload",);
    expect(chatPayload.messages,).toHaveLength(1,);
    const assetRow = rows.find((r,) => r.resourceType === "asset")!;
    const assetPayload = JSON.parse(assetRow.payload,) as Record<string, string>;
    expect(assetPayload.assetId,).toBe("a-payload",);
    expect(assetPayload.contentHash,).toBe("h-payload",);
    expect(assetPayload.storagePath,).toBe("/tmp/a-payload",);
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

  test("db snapshot hook is inert until enabled and never self-triggers", async () => {
    let calls = 0;
    const spy: BackupHook = async () => {
      calls += 1;
    };

    resetBackupScheduling();
    try {
      registerBackupHook("onDbSnapshot", spy,);
      expect(await scheduleDbSnapshotBackup(testDb, { ownerId: "u", },),).toEqual({
        scheduled: false,
        reason: "disabled",
      },);

      expect(calls,).toBe(0,);

      configureBackupScheduling({ enabled: true, onDbSnapshot: false, },);
      registerBackupHook("onDbSnapshot", spy,);
      expect((await scheduleDbSnapshotBackup(testDb, { ownerId: "u", },)).reason,).toBe("trigger-disabled",);
      expect(calls,).toBe(0,);

      configureBackupScheduling({ onDbSnapshot: true, },);
      registerBackupHook("onDbSnapshot", spy,);
      expect((await scheduleDbSnapshotBackup(testDb, { ownerId: "u", },)).scheduled,).toBe(true,);
      expect(calls,).toBe(1,);
      // A second explicit call fires exactly once more — no extra timer/loop.
      expect((await scheduleDbSnapshotBackup(testDb, { ownerId: "u", },)).scheduled,).toBe(true,);
      expect(calls,).toBe(2,);
    } finally {
      resetBackupScheduling();
    }
  });

  test("db snapshot retention prunes the oldest files", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "db-snapshot-retention-",),);
    try {
      for (let i = 0; i < 4; i += 1) {
        const file = path.join(dir, `snap-${i}.db`,);
        writeFileSync(file, "x",);
        const when = new Date(2026, 0, i + 1,).getTime();
        utimesSync(file, when, when,);
      }

      expect(pruneDbSnapshots(dir, 2,),).toBe(2,);
      expect(readdirSync(dir,).sort(),).toEqual(["snap-2.db", "snap-3.db",],);
    } finally {
      rmSync(dir, { recursive: true, force: true, },);
    }
  });
});

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Provisioned storage + backups: no raw secret persists; add→list→revoke
// round-trips; storage-bytes quota rejects pre-write; tampered payloads
// fail the integrity check.
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { QuotaExceededError, } from "../generation/quota-engine";
import { createLogger, } from "../logger";
import { createTestDb, destroyTestDb, } from "../test-utils/create-test-db";
import {
  addStorageResource,
  backupHooks,
  checkStorageAvailable,
  hashContent,
  HashMismatchError,
  listBackups,
  listStorageResources,
  persistBackupHook,
  pruneBackups,
  registerBackupHook,
  restoreBackupForOwner,
  revokeStorageResource,
  testStorageResource,
  verifyBackupIntegrity,
  writeBackup,
} from "./external-storage";

const SECRET = "sk-live-test-storage-secret";

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

describe("external-storage", () => {
  test("add→list→revoke round-trips without persisting the raw secret", async () => {
    const added = await addStorageResource(testDb, {
      id: "stor-roundtrip-1",
      ownerId: "user-1",
      kind: "webdav",
      endpoint: "https://dav.example.com/backups",
      secret: SECRET,
      storageQuotaBytes: 1024,
    },);

    expect(Object.keys(added,) as string[],).not.toContain("credentialRef",);

    const row = await testDb
      .selectFrom("resource_records",)
      .select(["credential_ref",],)
      .where("id", "=", "stor-roundtrip-1",)
      .executeTakeFirstOrThrow();

    expect(row.credential_ref,).not.toContain(SECRET,);

    const listed = await listStorageResources(testDb, "user-1",);
    expect(listed.some((r,) => r.id === "stor-roundtrip-1"),).toBe(true,);

    await revokeStorageResource(testDb, "stor-roundtrip-1",);
    const probe = await testStorageResource(testDb, "stor-roundtrip-1",);
    expect(probe.ok,).toBe(false,);
    if (!probe.ok) { expect(probe.reason,).toBe("revoked",); }
    await expect(checkStorageAvailable(testDb, "stor-roundtrip-1",),).rejects.toThrow("revoked",);
  });

  test("storage-bytes quota rejects the overflowing write before insert", async () => {
    await writeBackup(testDb, {
      resourceType: "chat",
      ownerId: "quota-user",
      payload: "hello",
      storageQuotaBytes: 10,
    },);

    let thrown: unknown;
    try {
      await writeBackup(testDb, {
        resourceType: "chat",
        ownerId: "quota-user",
        payload: "this payload is far too large",
        storageQuotaBytes: 10,
      },);
    } catch (error) {
      thrown = error;
    }

    expect(thrown,).toBeInstanceOf(QuotaExceededError,);
    const rows = await testDb
      .selectFrom("backup_records",)
      .select(["id",],)
      .where("owner_id", "=", "quota-user",)
      .execute();

    expect(rows,).toHaveLength(1,);
  });

  test("tampered payload fails the integrity check", async () => {
    const written = await writeBackup(testDb, {
      id: "backup-tamper-1",
      resourceType: "world",
      ownerId: "user-1",
      payload: '{"save":1}',
    },);

    const ok = await verifyBackupIntegrity(testDb, written.id,);
    expect(ok.contentHash,).toBe(written.contentHash,);

    await testDb
      .updateTable("backup_records",)
      .set({ payload: '{"save":2}', },)
      .where("id", "=", written.id,)
      .execute();

    await expect(verifyBackupIntegrity(testDb, written.id,),).rejects.toBeInstanceOf(HashMismatchError,);
  });

  test("hashContent is deterministic 64-hex", () => {
    const a = hashContent('{"save":1}',);
    expect(a,).toBe(hashContent('{"save":1}',),);
    expect(a,).toMatch(/^[0-9a-f]{64}$/,);
    expect(hashContent('{"save":2}',),).not.toBe(a,);
  });

  test("listBackups empty then after write, persistBackupHook round-trips", async () => {
    const empty = await listBackups(testDb, "backup-hook-user", "chat",);
    expect(empty,).toHaveLength(0,);
    await persistBackupHook(testDb, { ownerId: "backup-hook-user", resourceType: "chat", payload: '{"hook":1}', },);
    const after = await listBackups(testDb, "backup-hook-user", "chat",);
    expect(after,).toHaveLength(1,);
    expect(after[0]!.payload,).toBe('{"hook":1}',);
  });

  test("concurrent writeBackups under a tight quota serialize: exactly one wins", async () => {
    const payload = "x".repeat(8,);
    const results = await Promise.allSettled([
      writeBackup(testDb, {
        id: "race-1",
        resourceType: "chat",
        ownerId: "race-user",
        payload,
        storageQuotaBytes: 10,
      },),
      writeBackup(testDb, {
        id: "race-2",
        resourceType: "chat",
        ownerId: "race-user",
        payload,
        storageQuotaBytes: 10,
      },),
    ],);

    const wins = results.filter((r,) => r.status === "fulfilled");
    expect(wins,).toHaveLength(1,);
    const rows = await testDb
      .selectFrom("backup_records",)
      .select(["id",],)
      .where("owner_id", "=", "race-user",)
      .execute();

    expect(rows,).toHaveLength(1,);
    const used = payload.length;
    expect(used,).toBeLessThanOrEqual(10,);
  });

  test("pruneBackups keeps the latest N per owner+type scope", async () => {
    for (let i = 0; i < 5; i += 1) {
      await writeBackup(testDb, {
        id: `prune-${i}`,
        resourceType: "chat",
        ownerId: "prune-user",
        payload: JSON.stringify({ n: i, },),
      },);
    }

    // Distinct versions so ordering is deterministic.
    for (let i = 0; i < 5; i += 1) {
      await testDb
        .updateTable("backup_records",)
        .set({ version: i + 1, },)
        .where("id", "=", `prune-${i}`,)
        .execute();
    }

    const deleted = await pruneBackups(testDb, { ownerId: "prune-user", resourceType: "chat", keep: 2, },);
    expect(deleted,).toBe(3,);
    const rows = await listBackups(testDb, "prune-user", "chat",);
    expect(rows.map((r,) => r.id).sort(),).toEqual(["prune-3", "prune-4",],);
  });

  test("restoreBackupForOwner: non-owner is refused with zero applies", async () => {
    const written = await writeBackup(testDb, {
      id: "restore-owner-1",
      resourceType: "chat",
      ownerId: "restore-owner",
      payload: JSON.stringify({ chatId: "chat-1", save: 1, },),
    },);

    let applies = 0;
    const res = await restoreBackupForOwner(testDb, "restore-stranger", written.id, true, {
      applyPayload: () => {
        applies += 1;
      },
    },);

    expect(res.restored,).toBe(false,);
    expect(res.reason,).toBe("not owner",);
    expect(applies,).toBe(0,);
  });

  test("restoreBackupForOwner: unconfirmed restore is refused with zero applies", async () => {
    const written = await writeBackup(testDb, {
      id: "restore-unconfirmed-1",
      resourceType: "chat",
      ownerId: "restore-confirmer",
      payload: JSON.stringify({ chatId: "chat-2", save: 1, },),
    },);

    let applies = 0;
    const res = await restoreBackupForOwner(testDb, "restore-confirmer", written.id, false, {
      applyPayload: () => {
        applies += 1;
      },
    },);

    expect(res.restored,).toBe(false,);
    expect(res.reason,).toBe("recovery requires explicit user confirmation",);
    expect(applies,).toBe(0,);
  });

  test("restoreBackupForOwner: tampered payload is an integrity refusal", async () => {
    const written = await writeBackup(testDb, {
      id: "restore-tamper-1",
      resourceType: "world",
      ownerId: "restore-tamper-owner",
      payload: JSON.stringify({ save: 1, },),
    },);

    await testDb
      .updateTable("backup_records",)
      .set({ payload: JSON.stringify({ save: 2, },), },)
      .where("id", "=", written.id,)
      .execute();

    let applies = 0;
    const res = await restoreBackupForOwner(testDb, "restore-tamper-owner", written.id, true, {
      applyPayload: () => {
        applies += 1;
      },
    },);

    expect(res.restored,).toBe(false,);
    expect(applies,).toBe(0,);
  });

  test("restoreBackupForOwner: happy path applies once and writes one audit row", async () => {
    const ownerId = "restore-happy-owner";
    const written = await writeBackup(testDb, {
      id: "restore-happy-1",
      resourceType: "chat",
      ownerId,
      payload: JSON.stringify({ chatId: "chat-happy", save: 1, },),
    },);

    const applied: Array<{ resourceId: string; data: unknown }> = [];
    const res = await restoreBackupForOwner(testDb, ownerId, written.id, true, {
      applyPayload: (resourceId, data,) => {
        applied.push({ resourceId, data, },);
      },
    },);

    expect(res.restored,).toBe(true,);
    expect(applied,).toHaveLength(1,);
    expect(applied[0]!.resourceId,).toBe("chat-happy",);
    expect(applied[0]!.data,).toEqual({ chatId: "chat-happy", save: 1, },);

    const rows = await listBackups(testDb, ownerId, "chat",);
    expect(rows,).toHaveLength(2,);
    const audit = rows.find((r,) => r.id !== written.id)!;
    expect(JSON.parse(audit.payload,) as Record<string, unknown>,).toMatchObject({
      restoredFrom: written.id,
      resourceId: "chat-happy",
    },);
  });

  test("backupHooks register and invoke", async () => {
    let calls = 0;
    const prior = backupHooks.onChatEnd;
    registerBackupHook("onChatEnd", async () => {
      calls += 1;
    },);

    await backupHooks.onChatEnd(testDb, { ownerId: "u", resourceType: "chat", payload: "x", },);
    expect(calls,).toBe(1,);
    registerBackupHook("onChatEnd", prior,);
  });
});

afterAll(async () => {
  await destroyTestDb({ db: testDb, sqlite: testSqlite, },);
},);

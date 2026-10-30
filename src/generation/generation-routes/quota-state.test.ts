// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Quota-state read + admin override: owners see only their resources,
// admins see all and may reset windows; anonymous callers get 401 and
// non-admin override attempts get 403.
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { bindSharedQuotaEngine, getQuotaEngine, } from "../quota-engine";
import { handleBackupHashes, handleBackupRestore, handleQuotaOverride, handleQuotaState, } from "./quota-state";

let fixture: TestDb;

async function seedResource(id: string, owner: string,): Promise<void> {
  await fixture.db
    .insertInto("resource_records",)
    .values({
      id,
      owner_id: owner,
      type: "inference",
      provider: "mock",
      endpoint: "http://localhost",
      credential_ref: "ref",
      quota: '{"requestsPerMinute":2,"tokensPerMinute":100}',
      status: "active",
    },)
    .execute();
}

beforeAll(async () => {
  fixture = await createTestDb();
},);

afterAll(async () => {
  await destroyTestDb(fixture,);
},);

describe("handleQuotaState", () => {
  test("returns 401 without a userId", async () => {
    const res = await handleQuotaState(fixture.db, undefined, null,);
    expect(res.status,).toBe(401,);
  });

  test("owners see only their resources with used vs ceiling", async () => {
    await seedResource("qr-owner-1", "owner-a",);
    await seedResource("qr-owner-2", "owner-b",);
    const res = await handleQuotaState(fixture.db, "owner-a", "user",);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { resources: { id: string }[]; isAdmin: boolean };
    expect(body.isAdmin,).toBe(false,);
    expect(body.resources.map((r,) => r.id),).toEqual(["qr-owner-1",],);
  });

  test("admins see every resource", async () => {
    const res = await handleQuotaState(fixture.db, "anyone", "admin",);
    const body = await res.json() as { resources: unknown[]; isAdmin: boolean };
    expect(body.isAdmin,).toBe(true,);
    expect(body.resources.length,).toBeGreaterThanOrEqual(2,);
  });

  test("spent counters surface overQuota", async () => {
    await seedResource("qr-spent", "owner-a",);
    await fixture.db
      .insertInto("resource_quota_counters",)
      .values({ resource_id: "qr-spent", window_start: String(Date.now(),), requests: 2, tokens: 0, },)
      .execute();

    const res = await handleQuotaState(fixture.db, "owner-a", "user",);
    const body = await res.json() as { resources: { id: string; overQuota: boolean }[] };
    expect(body.resources.find((r,) => r.id === "qr-spent")?.overQuota,).toBe(true,);
  });

  test("expired windows read back as zeroed, not overQuota", async () => {
    await seedResource("qr-expired", "owner-a",);
    await fixture.db
      .insertInto("resource_quota_counters",)
      .values({ resource_id: "qr-expired", window_start: String(Date.now() - 120_000,), requests: 2, tokens: 0, },)
      .execute();

    const res = await handleQuotaState(fixture.db, "owner-a", "user",);
    const body = await res.json() as {
      resources: { id: string; overQuota: boolean; dimensions: { key: string; used: number }[] }[];
    };

    const gauge = body.resources.find((r,) => r.id === "qr-expired");

    expect(gauge?.overQuota,).toBe(false,);
    expect(gauge?.dimensions.find((d,) => d.key === "requests")?.used,).toBe(0,);
  });
});

describe("handleBackupHashes", () => {
  test("two chat backups for one owner stay two per-backup entries", async () => {
    await fixture.db
      .insertInto("backup_records",)
      .values({
        id: "bh-1",
        resource_type: "chat",
        owner_id: "backup-owner",
        content_hash: "abc123",
        payload: JSON.stringify({ chatId: "chat-a", },),
      },)
      .execute();

    await fixture.db
      .insertInto("backup_records",)
      .values({
        id: "bh-1b",
        resource_type: "chat",
        owner_id: "backup-owner",
        content_hash: "def456",
        payload: JSON.stringify({ chatId: "chat-b", },),
      },)
      .execute();

    await fixture.db
      .insertInto("backup_records",)
      .values({
        id: "bh-2",
        resource_type: "asset",
        owner_id: "other-owner",
        content_hash: "999999",
        payload: "{}",
      },)
      .execute();

    const res = await handleBackupHashes(fixture.db, "backup-owner", "user",);
    expect(res.status,).toBe(200,);
    const body = await res.json() as {
      hashes: Record<
        string,
        { id: string; resourceType: string; resourceId: string; serverHash?: string; serverVersion?: number }
      >;
    };

    expect(Object.keys(body.hashes,),).toEqual(["bh-1", "bh-1b",],);
    expect(body.hashes["bh-1"]?.serverHash,).toBe("abc123",);
    expect(body.hashes["bh-1"]?.resourceId,).toBe("chat-a",);
    expect(body.hashes["bh-1b"]?.serverHash,).toBe("def456",);
    expect(body.hashes["bh-1b"]?.resourceId,).toBe("chat-b",);
  });
});

describe("handleBackupRestore", () => {
  async function seedBackup(id: string, owner: string,): Promise<void> {
    const payload = JSON.stringify({ chatId: "chat-restore", },);
    const { createHash, } = await import("node:crypto");
    const hash = createHash("sha256",).update(payload, "utf8",).digest("hex",);
    await fixture.db
      .insertInto("backup_records",)
      .values({
        id,
        resource_type: "chat",
        owner_id: owner,
        content_hash: hash,
        payload,
      },)
      .execute();
  }

  test("returns 401 without a userId", async () => {
    const res = await handleBackupRestore({ confirm: true, }, "bh-restore-1", fixture.db, undefined, null,);
    expect(res.status,).toBe(401,);
  });

  test("confirm missing is 400 and writes nothing", async () => {
    await seedBackup("bh-restore-missing", "restore-owner",);
    const res = await handleBackupRestore({}, "bh-restore-missing", fixture.db, "restore-owner", "user",);
    expect(res.status,).toBe(400,);
    const rows = await fixture.db
      .selectFrom("backup_records",)
      .select(["id",],)
      .where("owner_id", "=", "restore-owner",)
      .execute();

    expect(rows.length,).toBe(1,);
  });

  test("owner with confirm restores and records the recovery", async () => {
    await seedBackup("bh-restore-ok", "restore-owner-ok",);
    const res = await handleBackupRestore(
      { confirm: true, },
      "bh-restore-ok",
      fixture.db,
      "restore-owner-ok",
      "user",
    );

    expect(res.status,).toBe(200,);
    const rows = await fixture.db
      .selectFrom("backup_records",)
      .select(["id", "payload",],)
      .where("owner_id", "=", "restore-owner-ok",)
      .execute();

    expect(rows.length,).toBe(2,);
  });

  test("non-owner gets 403", async () => {
    await seedBackup("bh-restore-denied", "restore-owner-other",);
    const res = await handleBackupRestore(
      { confirm: true, },
      "bh-restore-denied",
      fixture.db,
      "restore-intruder",
      "user",
    );

    expect(res.status,).toBe(403,);
  });

  test("unknown backup is 404", async () => {
    const res = await handleBackupRestore(
      { confirm: true, },
      "bh-restore-nope",
      fixture.db,
      "restore-owner-ok",
      "user",
    );

    expect(res.status,).toBe(404,);
  });
});

describe("handleQuotaOverride", () => {
  test("returns 401 without a userId", async () => {
    const res = await handleQuotaOverride({ resourceId: "x", }, fixture.db, undefined, null,);
    expect(res.status,).toBe(401,);
  });

  test("non-admins get 403", async () => {
    const res = await handleQuotaOverride({ resourceId: "qr-spent", }, fixture.db, "owner-a", "user",);
    expect(res.status,).toBe(403,);
  });

  test("admins reset the window", async () => {
    const res = await handleQuotaOverride({ resourceId: "qr-spent", }, fixture.db, "admin-1", "admin",);
    expect(res.status,).toBe(200,);
    const rows = await fixture.db
      .selectFrom("resource_quota_counters",)
      .select(["resource_id",],)
      .where("resource_id", "=", "qr-spent",)
      .execute();

    expect(rows.length,).toBe(0,);
  });

  test("override clears the shared engine's in-memory counter", async () => {
    // Seed both the DB row and the shared in-memory counter: without the
    // invalidateSharedQuota call the second-instance engine would keep
    // serving the stale count after the admin reset.
    bindSharedQuotaEngine(fixture.db,);
    try {
      const engine = getQuotaEngine();
      await fixture.db
        .insertInto("resource_quota_counters",)
        .values({ resource_id: "qr-shared-invalidate", window_start: String(Date.now(),), requests: 2, tokens: 0, },)
        .execute();

      await engine.readCounter("qr-shared-invalidate",);
      expect(engine.peek("qr-shared-invalidate",).requests,).toBe(2,);

      const res = await handleQuotaOverride({ resourceId: "qr-shared-invalidate", }, fixture.db, "admin-1", "admin",);
      expect(res.status,).toBe(200,);

      expect(engine.peek("qr-shared-invalidate",).requests,).toBe(0,);
    } finally {
      bindSharedQuotaEngine(null,);
    }
  });

  test("missing resourceId is 400", async () => {
    const res = await handleQuotaOverride({}, fixture.db, "admin-1", "admin",);
    expect(res.status,).toBe(400,);
  });
});

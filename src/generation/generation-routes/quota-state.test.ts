// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Quota-state read + admin override: owners see only their resources,
// admins see all and may reset windows; anonymous callers get 401 and
// non-admin override attempts get 403.
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { handleBackupHashes, handleQuotaOverride, handleQuotaState, } from "./quota-state";

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

  test("missing resourceId is 400", async () => {
    const res = await handleQuotaOverride({}, fixture.db, "admin-1", "admin",);
    expect(res.status,).toBe(400,);
  });
});

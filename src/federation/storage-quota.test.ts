// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Storage quota enforcement — soft warn-and-continue, hard refuse, the
 * pre-provider refusal (asserted by a provider spy recording ZERO
 * invocations), eviction ordering, and refusal when nothing is evictable.
 */

import { describe, expect, mock, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { AssetLinkEntity, AssetType, StorageBudgetScope, StorageEvictionPolicy, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertAssetLinks,
  insertAssets,
  insertInstanceStorageBudgets,
  insertUsers,
} from "../test-utils/insert-helpers";
import { upsertPeer, } from "./coordinator";
import { OPEN_RESERVATION_STATES, } from "./sharing";
import { runEvictionSweep, } from "./storage-eviction";
import {
  assertGenerationFitsStorage,
  assertStorageWriteAllowed,
  QUOTA_EXCEEDED_ERROR_CODE,
  quotaExceededResponse,
  storageUnavailableResponse,
  StorageWriteRefusedError,
} from "./storage-quota";
import { readStorageBudget, readStorageUsage, } from "./storage-usage";

const OWNER = "owner-1";

/** Temp uploadDir per test, removed afterwards. */
function tempDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "loop-lore-quota-",),);
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true, },), };
}

/**
 * Seed an asset AND its file on disk, so eviction and reconcile agree with
 * what the DB claims. The file is a short fixture — `size_bytes` is what the
 * quota compares, not the fixture length.
 */
async function seedAsset(
  db: Kysely<DB>,
  dir: string,
  opts: { id: string; bytes: number; createdAt: string },
): Promise<void> {
  mkdirSync(join(dir, opts.id,), { recursive: true, },);
  const storagePath = join(opts.id, "asset.bin",);
  writeFileSync(join(dir, storagePath,), Buffer.alloc(64, 1,),);
  await insertAssets(db, OWNER, `${opts.id}.bin`, "image/png", AssetType.Image, opts.bytes, storagePath, {
    id: opts.id,
    created_at: opts.createdAt,
  },);
}

/** Run a quota gate and hand back the refusal it threw, or null when it passed. */
async function refusalFrom(
  run: () => Promise<void>,
): Promise<StorageWriteRefusedError | null> {
  try {
    await run();
    return null;
  } catch (caught) {
    expect(caught,).toBeInstanceOf(StorageWriteRefusedError,);
    return caught as StorageWriteRefusedError;
  }
}

describe("usage accounting", () => {
  test("open reservations hold bytes and terminal ones release them", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "owner", "Owner", { id: OWNER, },);
    await upsertPeer(db, { origin: "https://b.example", state: "trusted", },);
    await db.insertInto("mesh_reservations",).values({
      id: "res-open",
      peer_origin: "https://b.example",
      content_hash: "h1",
      size_bytes: 250,
      content_type: "image/png",
      state: OPEN_RESERVATION_STATES[0],
      expires_at: "2099-01-01T00:00:00.000Z",
    },).execute();

    await db.insertInto("mesh_reservations",).values({
      id: "res-done",
      peer_origin: "https://b.example",
      content_hash: "h2",
      size_bytes: 900,
      content_type: "image/png",
      state: "released",
      expires_at: "2099-01-01T00:00:00.000Z",
    },).execute();

    const usage = await readStorageUsage({ database: db, scope: StorageBudgetScope.Total, },);
    expect(OPEN_RESERVATION_STATES,).toEqual(["reserved", "pushed",],);
    expect(usage.assetBytes,).toBe(0,);
    expect(usage.heldBytes,).toBe(250,);
    expect(usage.totalBytes,).toBe(250,);
  });
});

describe("readStorageBudget", () => {
  test("null when the operator set no row, and the row verbatim when they did", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "owner", "Owner", { id: OWNER, },);

    expect(await readStorageBudget({ database: db, scope: StorageBudgetScope.Image, },),).toBeNull();

    await insertInstanceStorageBudgets(db, {
      asset_class: StorageBudgetScope.Image,
      soft_limit_bytes: 500,
      hard_limit_bytes: 900,
      eviction_policy: StorageEvictionPolicy.OldestFirst,
    },);

    expect(await readStorageBudget({ database: db, scope: StorageBudgetScope.Image, },),).toEqual({
      scope: StorageBudgetScope.Image,
      softLimitBytes: 500,
      hardLimitBytes: 900,
      evictionPolicy: StorageEvictionPolicy.OldestFirst,
    },);
  });
});

describe("runEvictionSweep", () => {
  test("frees exactly what was asked for and stops", async () => {
    const { db, } = await createTestDb();
    const { dir, cleanup, } = tempDir();
    try {
      await insertUsers(db, "owner", "Owner", { id: OWNER, },);
      await seedAsset(db, dir, { id: "old", bytes: 300, createdAt: "2026-01-01T00:00:00Z", },);
      await seedAsset(db, dir, { id: "new", bytes: 300, createdAt: "2026-06-01T00:00:00Z", },);

      const sweep = await runEvictionSweep({
        database: db,
        uploadDir: dir,
        scope: StorageBudgetScope.Image,
        neededBytes: 300,
      },);

      expect(sweep.freedBytes,).toBe(300,);
      expect(sweep.evicted.map((entry,) => entry.assetId),).toEqual(["old",],);
      expect(sweep.evicted[0]?.reason,).toBe("unreferenced",);

      const survivors = await db.selectFrom("assets",).select("id",).execute();
      expect(survivors.map((row,) => row.id),).toEqual(["new",],);
    } finally {
      cleanup();
    }
  });
});

describe("soft limit", () => {
  test("warns and lets the write through when past soft but under hard", async () => {
    const { db, } = await createTestDb();
    const { dir, cleanup, } = tempDir();
    try {
      await insertUsers(db, "owner", "Owner", { id: OWNER, },);
      await seedAsset(db, dir, { id: "a1", bytes: 900, createdAt: "2026-01-01T00:00:00Z", },);
      await insertInstanceStorageBudgets(db, {
        asset_class: StorageBudgetScope.Image,
        soft_limit_bytes: 500,
        hard_limit_bytes: 10_000,
      },);

      const refusal = await refusalFrom(() =>
        assertStorageWriteAllowed({
          database: db,
          uploadDir: dir,
          incomingBytes: 100,
          assetType: AssetType.Image,
        },)
      );

      expect(refusal,).toBeNull();
      const usage = await readStorageUsage({ database: db, scope: StorageBudgetScope.Image, },);
      expect(usage.totalBytes,).toBe(900,);
    } finally {
      cleanup();
    }
  });
});

describe("hard limit", () => {
  test("refuses the write with federation.quota_exceeded", async () => {
    const { db, } = await createTestDb();
    const { dir, cleanup, } = tempDir();
    try {
      await insertUsers(db, "owner", "Owner", { id: OWNER, },);
      await seedAsset(db, dir, { id: "a1", bytes: 900, createdAt: "2026-01-01T00:00:00Z", },);
      await insertInstanceStorageBudgets(db, {
        asset_class: StorageBudgetScope.Image,
        soft_limit_bytes: 100,
        hard_limit_bytes: 1_000,
      },);

      const refusal = await refusalFrom(() =>
        assertStorageWriteAllowed({
          database: db,
          uploadDir: dir,
          incomingBytes: 500,
          assetType: AssetType.Image,
        },)
      );

      expect(refusal?.errorCode,).toBe(QUOTA_EXCEEDED_ERROR_CODE,);
      expect(QUOTA_EXCEEDED_ERROR_CODE,).toBe("federation.quota_exceeded",);
      expect(refusal?.limitBytes,).toBe(1_000,);
      expect(refusal?.wouldUseBytes,).toBe(1_400,);

      const response = quotaExceededResponse(refusal as StorageWriteRefusedError,);
      expect(response.status,).toBe(429,);
      const body = await response.json() as { code?: string };
      expect(body.code,).toBe("federation.quota_exceeded",);
    } finally {
      cleanup();
    }
  });

  test("no budget row means the write is never refused", async () => {
    const { db, } = await createTestDb();
    const { dir, cleanup, } = tempDir();
    try {
      await insertUsers(db, "owner", "Owner", { id: OWNER, },);
      await seedAsset(db, dir, { id: "a1", bytes: 10_000_000, createdAt: "2026-01-01T00:00:00Z", },);

      const refusal = await refusalFrom(() =>
        assertStorageWriteAllowed({
          database: db,
          uploadDir: dir,
          incomingBytes: 10_000_000,
          assetType: AssetType.Image,
        },)
      );

      expect(refusal,).toBeNull();
    } finally {
      cleanup();
    }
  });

  test("a missing uploadDir fails the write loudly instead of reading zero silently", async () => {
    const { db, } = await createTestDb();
    const missingDir = join(tmpdir(), "loop-lore-definitely-absent-9f3a",);
    await insertUsers(db, "owner", "Owner", { id: OWNER, },);
    await insertInstanceStorageBudgets(db, {
      asset_class: StorageBudgetScope.Image,
      hard_limit_bytes: 10_000_000,
    },);

    const refusal = await refusalFrom(() =>
      assertStorageWriteAllowed({
        database: db,
        uploadDir: missingDir,
        incomingBytes: 10,
        assetType: AssetType.Image,
      },)
    );

    expect(refusal?.errorCode,).toBe("federation.storage_unavailable",);

    const response = storageUnavailableResponse(refusal as StorageWriteRefusedError,);
    expect(response.status,).toBe(507,);
  });
});

describe("pre-provider refusal", () => {
  test("refuses before any provider call — spy records zero invocations", async () => {
    const providerSpy = mock(() => ({ ok: true, images: [], }));
    const { db, } = await createTestDb();
    const { dir, cleanup, } = tempDir();
    try {
      await insertUsers(db, "owner", "Owner", { id: OWNER, },);
      await insertInstanceStorageBudgets(db, {
        asset_class: StorageBudgetScope.Image,
        hard_limit_bytes: 1_000,
      },);

      // The call image-gen-route makes BEFORE `generateImages`. The spy stands
      // in for the provider and must never run.
      const refusal = await refusalFrom(async () => {
        await assertGenerationFitsStorage({
          database: db,
          uploadDir: dir,
          estimatedBytes: 1_500_000,
          assetType: AssetType.Image,
        },);

        await providerSpy();
      },);

      expect(refusal?.errorCode,).toBe("federation.quota_exceeded",);
      expect(providerSpy,).toHaveBeenCalledTimes(0,);
    } finally {
      cleanup();
    }
  });
});

describe("eviction", () => {
  test("evicts archived-linked first, then unreferenced, oldest first", async () => {
    const { db, } = await createTestDb();
    const { dir, cleanup, } = tempDir();
    try {
      await insertUsers(db, "owner", "Owner", { id: OWNER, },);
      await seedAsset(db, dir, { id: "unref-old", bytes: 400, createdAt: "2026-01-01T00:00:00Z", },);
      await seedAsset(db, dir, { id: "unref-new", bytes: 400, createdAt: "2026-06-01T00:00:00Z", },);
      await seedAsset(db, dir, { id: "archived", bytes: 400, createdAt: "2026-03-01T00:00:00Z", },);
      await insertAssetLinks(db, "archived", AssetLinkEntity.Character, "char-1", {
        archived_at: "2026-03-02T00:00:00Z",
      },);

      await insertInstanceStorageBudgets(db, {
        asset_class: StorageBudgetScope.Image,
        hard_limit_bytes: 1_100,
        eviction_policy: StorageEvictionPolicy.OldestFirst,
      },);

      // 1200 stored + 400 incoming = 1600 > 1100; two 400-byte evictions run.
      const refusal = await refusalFrom(() =>
        assertStorageWriteAllowed({
          database: db,
          uploadDir: dir,
          incomingBytes: 400,
          assetType: AssetType.Image,
        },)
      );

      expect(refusal,).toBeNull();
      const survivors = await db.selectFrom("assets",).select("id",).execute();
      expect(survivors.map((row,) => row.id),).toEqual(["unref-new",],);

      const audit = await db
        .selectFrom("log_entries",)
        .select(["action", "entity_id",],)
        .where("event_type", "=", "federation.storage.evicted",)
        .execute();

      expect(audit.map((row,) => row.entity_id).sort(),).toEqual(["archived", "unref-old",],);
      expect(audit.find((row,) => row.entity_id === "archived")?.action,).toBe("archived-unreferenced",);
    } finally {
      cleanup();
    }
  });

  test("never evicts an asset a live chat message references, and refuses when nothing is freeable", async () => {
    const { db, } = await createTestDb();
    const { dir, cleanup, } = tempDir();
    try {
      await insertUsers(db, "owner", "Owner", { id: OWNER, },);
      await seedAsset(db, dir, { id: "live", bytes: 900, createdAt: "2026-01-01T00:00:00Z", },);
      await insertAssetLinks(db, "live", AssetLinkEntity.Message, "msg-1",);

      await insertInstanceStorageBudgets(db, {
        asset_class: StorageBudgetScope.Image,
        hard_limit_bytes: 1_000,
        eviction_policy: StorageEvictionPolicy.OldestFirst,
      },);

      const refusal = await refusalFrom(() =>
        assertStorageWriteAllowed({
          database: db,
          uploadDir: dir,
          incomingBytes: 500,
          assetType: AssetType.Image,
        },)
      );

      expect(refusal?.errorCode,).toBe("federation.quota_exceeded",);

      // The protected asset survives — the budget is never exceeded to make room.
      const survivors = await db.selectFrom("assets",).select("id",).execute();
      expect(survivors.map((row,) => row.id),).toEqual(["live",],);
    } finally {
      cleanup();
    }
  });
});

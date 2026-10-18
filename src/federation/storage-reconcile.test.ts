// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Disk reconciliation — each drift direction built deliberately on disk (or
 * deleted from it), then reconciled. The report must name the vanished rows
 * and the orphans, never adopt an orphan and never re-create a vanished file.
 */

import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { AssetType, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertAssets, insertUsers, } from "../test-utils/insert-helpers";
import { RECONCILE_MAX_ENTRIES, reconcileStorageUsage, } from "./storage-reconcile";

const OWNER = "owner-1";

function tempDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "loop-lore-reconcile-",),);
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true, },), };
}

/** Seed an asset with a file on disk under its `storage_path`. */
async function seedAsset(
  db: Kysely<DB>,
  dir: string,
  opts: { id: string; bytes: number },
): Promise<void> {
  mkdirSync(join(dir, opts.id,), { recursive: true, },);
  const storagePath = join(opts.id, "asset.bin",);
  writeFileSync(join(dir, storagePath,), Buffer.alloc(opts.bytes, 1,),);
  await insertAssets(
    db,
    OWNER,
    `${opts.id}.bin`,
    "image/png",
    AssetType.Image,
    opts.bytes,
    storagePath,
    { id: opts.id, created_at: "2026-01-01T00:00:00Z", },
  );
}

describe("storage reconcile", () => {
  test("in sync when the DB and the disk agree", async () => {
    const { db, } = await createTestDb();
    const { dir, cleanup, } = tempDir();
    try {
      await insertUsers(db, "owner", "Owner", { id: OWNER, },);
      await seedAsset(db, dir, { id: "a1", bytes: 128, },);

      const report = await reconcileStorageUsage({ database: db, uploadDir: dir, },);

      expect(report.status,).toBe("in-sync",);
      expect(report.dbBytes,).toBe(128,);
      expect(report.diskBytes,).toBe(128,);
      expect(report.vanishedIds,).toEqual([],);
      expect(report.orphanPaths,).toEqual([],);
      expect(report.storageMissing,).toBe(false,);
      expect(report.walkTruncated,).toBe(false,);
      expect(RECONCILE_MAX_ENTRIES,).toBeGreaterThan(0,);

      // A tighter bound than the root holds truncates the walk and says so.
      const bounded = await reconcileStorageUsage({ database: db, uploadDir: dir, maxEntries: 0, },);
      expect(bounded.walkTruncated,).toBe(true,);
      expect(bounded.diskBytes,).toBe(0,);
    } finally {
      cleanup();
    }
  });

  test("DB > disk: names the vanished rows and never re-creates the file", async () => {
    const { db, } = await createTestDb();
    const { dir, cleanup, } = tempDir();
    try {
      await insertUsers(db, "owner", "Owner", { id: OWNER, },);
      await seedAsset(db, dir, { id: "a1", bytes: 128, },);
      await seedAsset(db, dir, { id: "a2", bytes: 256, },);

      // Somebody wiped a2 off disk. The DB row stays — it is the source of truth.
      rmSync(join(dir, "a2",), { recursive: true, force: true, },);

      const report = await reconcileStorageUsage({ database: db, uploadDir: dir, },);

      expect(report.status,).toBe("db-above-disk",);
      expect(report.vanishedIds,).toEqual(["a2",],);
      expect(report.dbBytes,).toBe(384,);
      expect(report.diskBytes,).toBe(128,);
      // Reported, not repaired.
      expect(report.orphanPaths,).toEqual([],);

      const rows = await db.selectFrom("assets",).select("id",).execute();
      expect(rows.map((row,) => row.id).sort(),).toEqual(["a1", "a2",],);
    } finally {
      cleanup();
    }
  });

  test("DB < disk: names orphans and never adopts them", async () => {
    const { db, } = await createTestDb();
    const { dir, cleanup, } = tempDir();
    try {
      await insertUsers(db, "owner", "Owner", { id: OWNER, },);
      await seedAsset(db, dir, { id: "a1", bytes: 128, },);

      // An untracked file with no owner, no chat link and no hash.
      mkdirSync(join(dir, "stray",), { recursive: true, },);
      writeFileSync(join(dir, "stray", "orphan.bin",), Buffer.alloc(64, 1,),);

      const report = await reconcileStorageUsage({ database: db, uploadDir: dir, },);

      expect(report.status,).toBe("disk-above-db",);
      expect(report.orphanPaths,).toEqual([join("stray", "orphan.bin",),],);
      expect(report.dbBytes,).toBe(128,);
      expect(report.diskBytes,).toBe(192,);
      expect(report.vanishedIds,).toEqual([],);

      // Adoption would mint an asset nobody asked for. It did not happen.
      const rows = await db.selectFrom("assets",).select("id",).execute();
      expect(rows.map((row,) => row.id),).toEqual(["a1",],);
    } finally {
      cleanup();
    }
  });

  test("missing storage root: usage reads zero and the discrepancy is reported, not reset", async () => {
    const { db, } = await createTestDb();
    const goneDir = join(tmpdir(), "loop-lore-reconcile-gone-4b21",);
    try {
      await insertUsers(db, "owner", "Owner", { id: OWNER, },);
      await seedAsset(db, goneDir, { id: "a1", bytes: 128, },);
      rmSync(goneDir, { recursive: true, force: true, },);

      const report = await reconcileStorageUsage({ database: db, uploadDir: goneDir, },);

      expect(report.storageMissing,).toBe(true,);
      expect(report.status,).toBe("db-above-disk",);
      expect(report.diskBytes,).toBe(0,);
      expect(report.dbBytes,).toBe(128,);
      expect(report.vanishedIds,).toEqual(["a1",],);

      const rows = await db.selectFrom("assets",).select("id",).execute();
      expect(rows.map((row,) => row.id),).toEqual(["a1",],);
    } finally {
      rmSync(goneDir, { recursive: true, force: true, },);
    }
  });
});

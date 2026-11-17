// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Concurrency tests for the asset dedup key (migration 028).
 *
 * The dedup pre-read in `createAsset` was a check-then-act race: two callers
 * with the same owner and bytes both read `existing === null` and both
 * inserted. The insert is now the arbiter — a unique index rejects the loser —
 * so these tests exercise real interleavings rather than the serial path.
 */
import { describe, expect, test, } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { AssetType, } from "../../db/enums";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertAssets, insertUsers, } from "../../test-utils/insert-helpers";
import { makeMinimalPng, } from "../test-helpers";
import { createAsset, hashBuffer, } from "./create";
import type { CreateAssetInput, } from "./types";

const ownerIdFor = async (
  db: Parameters<typeof insertUsers>[0],
  username: string,
): Promise<string> => {
  return (await db
    .selectFrom("users",)
    .select("id",)
    .where("username", "=", username,)
    .executeTakeFirstOrThrow()).id;
};

/** Every file under the upload dir, relative to it. */
function listAllFiles(root: string,): string[] {
  const out: string[] = [];
  const walk = (dir: string,) => {
    for (const entry of readdirSync(dir, { withFileTypes: true, },)) {
      const full = join(dir, entry.name,);
      if (entry.isDirectory()) { walk(full,); }
      else { out.push(full.slice(root.length + 1,),); }
    }
  };

  walk(root,);
  return out.sort();
}

describe("createAsset concurrent dedup", () => {
  test("8 concurrent identical uploads by one owner yield exactly one row and one id", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-asset-race-",),);
    await insertUsers(db, "race-owner", "Race Owner",);
    const ownerId = await ownerIdFor(db, "race-owner",);
    const buffer = makeMinimalPng(5, 4,);
    const input: CreateAssetInput = {
      ownerId,
      filename: "race.png",
      mimeType: "image/png",
      assetType: AssetType.Image,
      sizeBytes: buffer.length,
      buffer,
    };

    try {
      // Truly parallel: every call is dispatched before any awaited result is
      // observed, so the pre-read (if it existed) would interleave.
      const results = await Promise.all(
        Array.from({ length: 8, }, () => createAsset({ database: db, input, uploadDir, },),),
      );

      const rows = await db.selectFrom("assets",).select(["id", "content_hash",],).execute();
      expect(rows.length,).toBe(1,);

      const ids = new Set(results.map((r,) => r.asset.id),);
      expect(ids.size, `every caller must get the winner's id, got ${[...ids,].join(",",)}`,).toBe(1,);

      const winners = results.filter((r,) => !r.duplicate);
      expect(winners.length, "exactly one caller may report the row it created",).toBe(1,);

      // The losers must not report their own (never-inserted) id, and must
      // return the winner's stored row rather than their own in-memory draft.
      // Compare against the row that actually survived, not results[0], which
      // may itself be a loser.
      const stored = await db.selectFrom("assets",).select(["id", "created_at",],).executeTakeFirstOrThrow();
      for (const r of results.filter((x,) => x.duplicate)) {
        expect(r.asset.id,).toBe(stored.id,);
        expect(r.asset.created_at, "loser must return the winner's stored created_at",).toBe(
          stored.created_at,
        );
      }

      // One row means one stored copy. `raw/` holds the original bytes;
      // `compressed/` holds the winner's thumbnail.
      const raw = listAllFiles(join(uploadDir, "raw",),).filter((f,) => f.endsWith(".png",));
      expect(raw.length, `orphaned originals on disk: ${raw.join(",",)}`,).toBe(1,);
      expect(new Uint8Array(readFileSync(join(uploadDir, "raw", raw[0]!,),),),).toEqual(
        new Uint8Array(buffer,),
      );
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("identical bytes for different owners both succeed — the index is owner-scoped", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-asset-owner-",),);
    await insertUsers(db, "owner-a", "Owner A",);
    await insertUsers(db, "owner-b", "Owner B",);
    const ownerA = await ownerIdFor(db, "owner-a",);
    const ownerB = await ownerIdFor(db, "owner-b",);
    const buffer = makeMinimalPng(4, 4,);
    const base: Omit<CreateAssetInput, "ownerId"> = {
      filename: "shared.png",
      mimeType: "image/png",
      assetType: AssetType.Image,
      sizeBytes: buffer.length,
      buffer,
    };

    try {
      const [a, b,] = await Promise.all([
        createAsset({ database: db, input: { ...base, ownerId: ownerA, }, uploadDir, },),
        createAsset({ database: db, input: { ...base, ownerId: ownerB, }, uploadDir, },),
      ],);

      // A globally-unique content index would collapse these into one row and
      // leak one user's asset to the other.
      expect(a.duplicate,).toBe(false,);
      expect(b.duplicate,).toBe(false,);
      expect(a.asset.id,).not.toBe(b.asset.id,);
      expect(a.asset.owner_id,).toBe(ownerA,);
      expect(b.asset.owner_id,).toBe(ownerB,);

      const rows = await db.selectFrom("assets",).select("id",).execute();
      expect(rows.length,).toBe(2,);
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("rows differing only in encryption_tier do not collide", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-asset-tier-",),);
    await insertUsers(db, "tier-owner", "Tier Owner",);
    const ownerId = await ownerIdFor(db, "tier-owner",);
    const buffer = makeMinimalPng(3, 3,);
    const base: CreateAssetInput = {
      ownerId,
      filename: "tiered.png",
      mimeType: "image/png",
      assetType: AssetType.Image,
      sizeBytes: buffer.length,
      buffer,
    };

    try {
      // Same owner, same bytes, different tier: the index keys on
      // encryption_tier, so this must not be treated as a duplicate row.
      const publicAsset = await createAsset({
        database: db,
        input: { ...base, encryptionTier: "public", },
        uploadDir,
      },);

      const chatAsset = await createAsset({
        database: db,
        input: { ...base, encryptionTier: "chat", },
        uploadDir,
      },);

      expect(publicAsset.duplicate,).toBe(false,);
      expect(chatAsset.duplicate,).toBe(false,);
      expect(chatAsset.asset.id,).not.toBe(publicAsset.asset.id,);

      const rows = await db
        .selectFrom("assets",)
        .select(["encryption_tier", "encrypted_key_id",],)
        .orderBy("encryption_tier",)
        .execute();

      expect(rows.length,).toBe(2,);
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("concurrent loser is handed the asset at ITS OWN tier, never a foreign tier", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-asset-tier-race-",),);
    await insertUsers(db, "tier-race-owner", "Tier Race Owner",);
    const ownerId = await ownerIdFor(db, "tier-race-owner",);
    const buffer = makeMinimalPng(3, 3,);
    const base: Omit<CreateAssetInput, "ownerId"> = {
      filename: "tier-race.png",
      mimeType: "image/png",
      assetType: AssetType.Image,
      sizeBytes: buffer.length,
      buffer,
    };

    try {
      // This owner already holds identical bytes at two tiers, so a re-read
      // keyed only on (content, owner) has a foreign row to return. The chat
      // row is inserted first so it is earlier in scan order than the public
      // one — the unfiltered re-read returns it first.
      const chatRow = await createAsset({
        database: db,
        input: { ...base, ownerId, encryptionTier: "chat", },
        uploadDir,
      },);

      const publicRow = await createAsset({
        database: db,
        input: { ...base, ownerId, encryptionTier: "public", },
        uploadDir,
      },);

      // Both race at the public tier: one writes, one loses and re-reads.
      const raced = await Promise.all([
        createAsset({ database: db, input: { ...base, ownerId, encryptionTier: "public", }, uploadDir, },),
        createAsset({ database: db, input: { ...base, ownerId, encryptionTier: "public", }, uploadDir, },),
      ],);

      // The loser must be handed the public row it collided with, not the chat
      // row that shares its content hash. Handing back the chat row would send
      // the caller to an asset encrypted under a different context.
      for (const r of raced) {
        if (!r.duplicate) { continue; }
        expect(r.asset.encryption_tier, "loser must not be handed a foreign tier",).toBe("public",);
        expect(r.asset.encrypted_key_id,).toBeNull();
        expect(r.asset.id, "loser must get the public row, not the earlier chat row",).toBe(
          publicRow.asset.id,
        );
      }

      expect(raced.some((r,) => r.duplicate), "the race must actually produce a loser",).toBe(true,);

      // The chat row is untouched by the public-tier race.
      const chatAfter = await db
        .selectFrom("assets",)
        .select("id",)
        .where("id", "=", chatRow.asset.id,)
        .executeTakeFirst();

      expect(chatAfter?.id,).toBe(chatRow.asset.id,);

      const rows = await db.selectFrom("assets",).select("encryption_tier",).execute();
      expect(rows.length,).toBe(2,);
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("dedupe:false stores a NULL content_hash so repeated identical bytes never collide", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-asset-nodedupe-",),);
    await insertUsers(db, "nodedupe-owner", "No Dedupe Owner",);
    const ownerId = await ownerIdFor(db, "nodedupe-owner",);
    const buffer = makeMinimalPng(2, 2,);
    const base: CreateAssetInput = {
      ownerId,
      filename: "iteration.png",
      mimeType: "image/png",
      assetType: AssetType.Image,
      sizeBytes: buffer.length,
      buffer,
    };

    try {
      // A regeneration run that reproduces existing bytes is still its own
      // item (persist-generated.ts). If the opt-out stored the hash, the new
      // unique index would reject the second write outright.
      const first = await createAsset({
        database: db,
        input: { ...base, dedupe: false, },
        uploadDir,
      },);

      const second = await createAsset({
        database: db,
        input: { ...base, dedupe: false, },
        uploadDir,
      },);

      expect(first.duplicate,).toBe(false,);
      expect(second.duplicate,).toBe(false,);
      expect(second.asset.id,).not.toBe(first.asset.id,);

      const rows = await db.selectFrom("assets",).select("content_hash",).execute();
      expect(rows.length,).toBe(2,);
      for (const row of rows) { expect(row.content_hash,).toBeNull(); }
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("a dedup hit on another instance's row is a miss, not a duplicate", async () => {
    const { db, sqlite, } = await createTestDb();
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-asset-foreign-",),);
    const foreignDir = mkdtempSync(join(tmpdir(), "ll-asset-foreign-other-",),);
    await insertUsers(db, "foreign-owner", "Foreign Owner",);
    const ownerId = await ownerIdFor(db, "foreign-owner",);
    const buffer = makeMinimalPng(5, 4,);
    const contentHash = hashBuffer(buffer,);

    try {
      // A row written by another instance: same owner, same bytes, same tier —
      // so the dedup key fires — but its bytes live in another upload dir.
      const foreignPath = join(foreignDir, "raw", "aa", "bb", "foreign.png",);
      const foreignId = await insertAssets(
        db,
        ownerId,
        "foreign.png",
        "image/png",
        AssetType.Image,
        buffer.length,
        foreignPath,
        { content_hash: contentHash, encryption_tier: "public", encrypted_key_id: null, },
      );

      const result = await createAsset({
        database: db,
        input: {
          ownerId,
          filename: "foreign.png",
          mimeType: "image/png",
          assetType: AssetType.Image,
          sizeBytes: buffer.length,
          buffer,
        },
        uploadDir,
      },);

      // The foreign row must not be handed back: its bytes are not ours to
      // serve or delete, so the caller gets the local copy instead.
      expect(result.duplicate,).toBe(false,);
      expect(result.asset.id,).not.toBe(foreignId,);
      expect(result.asset.storage_path,).not.toBe(foreignPath,);

      // The local copy is kept on disk and is what the caller gets.
      expect(result.asset.storage_path,).toMatch(/^raw\//,);
      expect(existsSync(join(uploadDir, result.asset.storage_path,),),).toBe(true,);

      // The foreign row is untouched, and the local row is stored under its
      // own id — with a NULL content_hash, since the dedup key is taken.
      const rows = await db.selectFrom("assets",).select(["id", "storage_path", "content_hash",],).execute();
      expect(rows.length,).toBe(2,);

      const local = rows.find((row,) => row.id === result.asset.id);
      expect(local?.storage_path,).toBe(result.asset.storage_path,);
      expect(local?.content_hash,).toBeNull();

      const foreign = rows.find((row,) => row.id === foreignId);
      expect(foreign?.storage_path,).toBe(foreignPath,);
      expect(foreign?.content_hash,).toBe(contentHash,);
    } finally {
      sqlite.close();
      rmSync(uploadDir, { recursive: true, force: true, },);
      rmSync(foreignDir, { recursive: true, force: true, },);
    }
  });
});

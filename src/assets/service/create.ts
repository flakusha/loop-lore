// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset Service — create asset
 */
import type { AnyColumn, } from "kysely";
import { encryptAssetBlob, } from "../../crypto/asset-encryption";
import { AssetVisibility, StorageBackend, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { uid, } from "../../utils";
import { extractImageMetadata, } from "../metadata";
import { initialAlphaStatus, } from "./alpha-status";
import { deleteFile, storeFile, } from "./file-system";
import { writeThumbnail, } from "./thumbnail";
import { seedBaseTransform, } from "./transforms";
import type { AssetRecord, CreateAssetOpts, CreateAssetResult, } from "./types";

/**
 * @param root0
 * @param root0.database
 * @param root0.input
 * @param root0.uploadDir
 * @returns Promise<unknown>
 */
export async function createAsset({ database, input, uploadDir, }: CreateAssetOpts,): Promise<CreateAssetResult> {
  // Compute content hash for idempotent upload detection
  const hasher = new Bun.CryptoHasher("sha256",);
  hasher.update(input.buffer,);
  const contentHash = hasher.digest("hex",);

  // `dedupe: false` opts out of idempotency entirely. Persisting the hash would
  // put the row inside the uq_assets_owner_content_* partial indexes and make a
  // re-run of a generated asset collide with its own earlier output
  // (persist-generated.ts), so an opted-out call stores NULL and the partial
  // predicate leaves it alone. A NULL hash is the opt-out, not an edge case.
  const dedupe = input.dedupe !== false;
  const dedupeKey = dedupe ? contentHash : null;

  const id = uid();

  // Determine encryption tier (default: public)
  const encryptionTier = input.encryptionTier ?? "public";

  // Encrypt blob if needed
  let storageBuffer = input.buffer;
  let encryptedKeyId: string | null = null;

  if (encryptionTier !== "public" && input.chatKey && input.keyId && input.pipelineConfig) {
    // assetId must exist by this point — uid() generated above
    const result = await encryptAssetBlob(
      input.buffer,
      input.chatKey,
      input.keyId,
      id,
      input.pipelineConfig,
      encryptionTier,
    );
    if (result.encrypted) {
      storageBuffer = result.data;
      encryptedKeyId = result.keyId;
    }
  }

  const storagePath = storeFile(uploadDir, id, input.filename, storageBuffer,);

  // Extract image metadata from original buffer (before encryption)
  let width = input.width ?? null;
  let height = input.height ?? null;
  let altText = input.altText ?? null;
  let alphaStatus: AssetRecord["alpha_status"] = "unknown";
  if (input.mimeType.startsWith("image/",)) {
    const meta = extractImageMetadata(input.buffer,);
    if (width === null && meta.width > 0) { width = meta.width; }
    if (height === null && meta.height > 0) { height = meta.height; }
    if (altText === null && meta.caption) { altText = meta.caption; }
    alphaStatus = initialAlphaStatus(input.mimeType, meta.hasAlpha,);
  }

  // Sanitize alt_text: strip HTML tags, limit length
  if (altText) {
    altText = altText.replaceAll(/<[^>]*>/g, "",).trim().slice(0, 500,);
  }

  // Generate 256px WebP thumbnail for image assets. Best-effort: a sharp
  // decode/encode failure leaves thumbnail_path null, and the serve path
  // falls back to the raw bytes (no request breakage).
  let thumbnailPath: string | null = null;
  if (input.mimeType.startsWith("image/",)) {
    thumbnailPath = await writeThumbnail(uploadDir, id, input.buffer,);
  }

  const asset: AssetRecord = {
    id,
    owner_id: input.ownerId,
    filename: input.filename,
    mime_type: input.mimeType,
    asset_type: input.assetType,
    size_bytes: input.sizeBytes,
    storage_path: storagePath,
    storage_backend: StorageBackend.Local,
    visibility: AssetVisibility.Private,
    width,
    height,
    duration_secs: null,
    alt_text: altText,
    created_at: new Date().toISOString(),
    encryption_tier: encryptionTier,
    encrypted_key_id: encryptedKeyId,
    alpha_status: alphaStatus,
    thumbnail_path: thumbnailPath,
  };

  const values = {
    id: asset.id,
    owner_id: asset.owner_id,
    filename: asset.filename,
    mime_type: asset.mime_type,
    asset_type: asset.asset_type,
    size_bytes: asset.size_bytes,
    storage_path: asset.storage_path,
    storage_backend: asset.storage_backend,
    visibility: asset.visibility,
    width: asset.width,
    height: asset.height,
    duration_secs: asset.duration_secs,
    alt_text: asset.alt_text,
    encryption_tier: asset.encryption_tier,
    encrypted_key_id: asset.encrypted_key_id,
    alpha_status: asset.alpha_status,
    content_hash: dedupeKey,
    thumbnail_path: asset.thumbnail_path,
  };

  // The INSERT is the arbiter. A pre-read followed by an insert is a
  // check-then-act race: two concurrent calls with identical bytes both read
  // null and both insert. The unique indexes added by 028 let the database
  // reject the loser instead, so exactly one row survives no matter how the
  // calls interleave.
  //
  // The conflict target must repeat the partial-index predicate. SQLite refuses
  // to bind a plain `ON CONFLICT (cols)` to a partial index ("ON CONFLICT clause
  // does not match any PRIMARY KEY or UNIQUE constraint"), so the WHERE is part
  // of the conflict target, not a filter on the statement. The two indexes are
  // mutually exclusive on encrypted_key_id (IS NOT NULL vs IS NULL), so the
  // matching one is selected here rather than left to SQLite to infer.
  const conflictColumns: ReadonlyArray<AnyColumn<DB, "assets">> = encryptedKeyId === null
    ? ["owner_id", "content_hash", "encryption_tier",]
    : ["owner_id", "content_hash", "encryption_tier", "encrypted_key_id",];

  const insert = dedupe
    ? database
      .insertInto("assets",)
      .values(values,)
      .onConflict((oc,) =>
        oc
          .columns(conflictColumns,)
          .where("content_hash", "is not", null,)
          .where("encrypted_key_id", encryptedKeyId === null ? "is" : "is not", null,)
          .doNothing()
      )
      .execute()
    : database.insertInto("assets",).values(values,).execute();

  const result = await insert;

  // Nothing written: another caller won the race and committed the same bytes.
  // Hand back the winner's asset so the caller links the real id, and drop the
  // bytes this call already wrote — storage_path is keyed by our own uid, so
  // nothing references them. The thumbnail lives under the same id-scoped
  // layout and goes with them.
  if (result.length > 0 && Number(result[0]!.numInsertedOrUpdatedRows,) === 0) {
    if (thumbnailPath !== null) { deleteFile(uploadDir, thumbnailPath,); }
    deleteFile(uploadDir, storagePath,);

    const existing = await database
      .selectFrom("assets",)
      .select([
        "id",
        "filename",
        "mime_type",
        "asset_type",
        "size_bytes",
        "storage_backend",
        "alt_text",
        "visibility",
        "created_at",
        "encryption_tier",
        "encrypted_key_id",
        "storage_path",
        "width",
        "height",
        "duration_secs",
        "alpha_status",
        "owner_id",
        "thumbnail_path",
      ],)
      .where("content_hash", "=", contentHash,)
      .where("owner_id", "=", input.ownerId,)
      .executeTakeFirst();

    if (existing) {
      return {
        asset: {
          id: existing.id,
          owner_id: existing.owner_id,
          filename: existing.filename,
          mime_type: existing.mime_type,
          asset_type: existing.asset_type,
          size_bytes: existing.size_bytes,
          storage_path: existing.storage_path,
          storage_backend: existing.storage_backend,
          visibility: existing.visibility,
          width: existing.width,
          height: existing.height,
          duration_secs: existing.duration_secs,
          alt_text: existing.alt_text,
          created_at: existing.created_at,
          encryption_tier: existing.encryption_tier,
          encrypted_key_id: existing.encrypted_key_id,
          alpha_status: existing.alpha_status,
          thumbnail_path: existing.thumbnail_path,
        },
        duplicate: true,
      };
    }
  }

  if (input.mimeType.startsWith("image/",)) {
    await seedBaseTransform(database, id,);
  }
  return { asset, duplicate: false, };
}

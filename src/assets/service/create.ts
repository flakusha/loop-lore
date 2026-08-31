// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset Service — create asset
 */
import { encryptAssetBlob, } from "../../crypto/asset-encryption";
import { AssetVisibility, StorageBackend, } from "../../db/enums";
import { uid, } from "../../utils";
import { extractImageMetadata, } from "../metadata";
import { storeFile, } from "./file-system";
import type { AssetRecord, CreateAssetOpts, CreateAssetResult, } from "./types";

/**
 * @param root0
 * @param root0.database
 * @param root0.input
 * @param root0.uploadDir
 */
export async function createAsset({ database, input, uploadDir, }: CreateAssetOpts,): Promise<CreateAssetResult> {
  // Compute content hash for idempotent upload detection
  const hasher = new Bun.CryptoHasher("sha256",);
  hasher.update(input.buffer,);
  const contentHash = hasher.digest("hex",);

  // Check for existing asset with same content and owner
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
      "owner_id",
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
      },
      duplicate: true,
    };
  }

  const id = uid();

  // Determine encryption tier (default: public)
  const encryptionTier = input.encryptionTier ?? "public";

  // Encrypt blob if needed
  let storageBuffer = input.buffer;
  let encryptedKeyId: string | null = null;

  if (encryptionTier !== "public" && input.chatKey && input.keyId && input.pipelineConfig) {
    // assetId must exist by this point — uid() generated at line 69
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
  if (input.mimeType.startsWith("image/",)) {
    const meta = extractImageMetadata(input.buffer,);
    if (width === null && meta.width > 0) { width = meta.width; }
    if (height === null && meta.height > 0) { height = meta.height; }
    if (altText === null && meta.caption) { altText = meta.caption; }
  }

  // Sanitize alt_text: strip HTML tags, limit length
  if (altText) {
    altText = altText.replaceAll(/<[^>]*>/g, "",).trim().slice(0, 500,);
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
  };

  await database
    .insertInto("assets",)
    .values({
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
      content_hash: contentHash,
    },)
    .execute();

  return { asset, duplicate: false, };
}

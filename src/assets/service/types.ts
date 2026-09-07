// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset Service — shared types
 */
import type { Kysely, } from "kysely";
import type { ChatKey, } from "../../crypto/chat-keys";
import type { PipelineConfig, } from "../../crypto/pipeline";
import type {
  AssetAlphaStatus,
  AssetLinkEntity,
  AssetType as AssetTypeT,
  AssetVisibility,
  StorageBackend,
} from "../../db/enums";
import type { DB, } from "../../db/schema";

/** */
export interface AssetRecord {
  id: string;
  owner_id: string;
  filename: string;
  mime_type: string;
  asset_type: AssetTypeT;
  size_bytes: number;
  storage_path: string;
  storage_backend: StorageBackend;
  visibility: AssetVisibility;
  width: number | null;
  height: number | null;
  duration_secs: number | null;
  alt_text: string | null;
  created_at: string;
  encryption_tier: string;
  encrypted_key_id: string | null;
  alpha_status: AssetAlphaStatus;
}

/** */
export interface CreateAssetInput {
  ownerId: string;
  filename: string;
  mimeType: string;
  assetType: AssetTypeT;
  sizeBytes: number;
  buffer: Buffer;
  altText?: string;
  width?: number;
  height?: number;
  encryptionTier?: string;
  chatKey?: ChatKey | null;
  keyId?: string | null;
  pipelineConfig?: PipelineConfig;
}

/** */
export interface AssetLinkInput {
  entityType: AssetLinkEntity;
  entityId: string;
  label?: string;
}

/** */
export interface CreateAssetOpts {
  database: Kysely<DB>;
  input: CreateAssetInput;
  uploadDir: string;
}

/** */
export interface DeleteAssetOpts {
  database: Kysely<DB>;
  assetId: string;
  uploadDir: string;
}

/** */
export interface UnlinkAssetOpts {
  database: Kysely<DB>;
  assetId: string;
  entityType: AssetLinkEntity;
  entityId: string;
}

/** */
export interface LinkAssetOpts {
  database: Kysely<DB>;
  assetId: string;
  link: AssetLinkInput;
}

/** */
export interface ShareRecord {
  id: string;
  asset_id: string;
  shared_with_id: string;
  shared_by_id: string;
  created_at: string;
}

/** */
export interface UpdateVisibilityOpts {
  database: Kysely<DB>;
  assetId: string;
  visibility: AssetVisibility;
  actorId: string;
}

/** */
export interface ShareAssetOpts {
  database: Kysely<DB>;
  assetId: string;
  sharedWithId: string;
  sharedById: string;
}

/** */
export interface UnshareAssetOpts {
  database: Kysely<DB>;
  assetId: string;
  sharedWithId: string;
}

/**
 * Result of creating an asset. `duplicate` is true when the same content
 * + owner was already uploaded (idempotent upload detection).
 */
export interface CreateAssetResult {
  asset: AssetRecord;
  duplicate: boolean;
}

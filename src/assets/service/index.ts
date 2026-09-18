// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset Service
 *
 * Core CRUD operations for the polymorphic asset system.
 * Barrel: re-exports the public API from domain modules (flat function bank).
 */
export {
  createAsset,
} from "./create";
export {
  deleteAsset,
} from "./delete";
export {
  detectAssetType,
  mimeFromExtension,
} from "./detect";
export {
  getAssetFilePath,
} from "./file-system";
export {
  deleteAssetLink,
  getAssetLinks,
  linkAsset,
  unlinkAsset,
} from "./links";
export {
  persistGeneratedImages,
} from "./persist-generated";
export type {
  PersistedGeneratedImage,
  PersistGeneratedImagesOpts,
} from "./persist-generated";
export {
  canAccessAsset,
  getAsset,
  getAssetData,
  isAssetEncrypted,
  listAssets,
} from "./read";
export {
  getAssetShares,
  shareAsset,
  unshareAsset,
  updateAssetVisibility,
} from "./shares";
export {
  validateFileSize,
  validateMimeType,
} from "./validate";

export {
  getAssetTransform,
  resolveAssetTransform,
  SEED_FOCAL_POINT,
  seedBaseTransform,
  upsertAssetTransform,
} from "./transforms";

export type {
  AssetLinkInput,
  AssetRecord,
  CreateAssetInput,
  CreateAssetOpts,
  CreateAssetResult,
  DeleteAssetLinkOpts,
  DeleteAssetOpts,
  LinkAssetOpts,
  ShareAssetOpts,
  ShareRecord,
  UnlinkAssetOpts,
  UnshareAssetOpts,
  UpdateVisibilityOpts,
} from "./types";

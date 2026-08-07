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
  getAssetLinks,
  linkAsset,
  unlinkAsset,
} from "./links";
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

export type {
  AssetLinkInput,
  AssetRecord,
  CreateAssetInput,
  CreateAssetOpts,
  CreateAssetResult,
  DeleteAssetOpts,
  LinkAssetOpts,
  ShareAssetOpts,
  ShareRecord,
  UnlinkAssetOpts,
  UnshareAssetOpts,
  UpdateVisibilityOpts,
} from "./types";

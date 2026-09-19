// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Resolve the absolute path of a compressed variant (thumb/compressed) on
 * disk. Returns null when no candidate exists, in which case the caller
 * falls back to the raw bytes.
 *
 * For `variant === "thumb"` the persisted `thumbnail_path` column (written
 * by `createAsset` on upload) is preferred; falls back to the legacy
 * deterministic `compressed/<sub>/<id>_<variant>.webp` layout.
 */
import { existsSync, } from "node:fs";
import { getAssetFilePath, } from "./service/file-system";

/**
 * @param root0
 * @param root0.uploadDir
 * @param root0.assetId
 * @param root0.variant
 * @param root0.thumbnailPath
 * @returns Absolute filesystem path to the variant, or null when missing.
 */
export function resolveCompressedVariantPath({
  uploadDir,
  assetId,
  variant,
  thumbnailPath,
}: {
  uploadDir: string;
  assetId: string;
  variant: string;
  thumbnailPath: string | null;
},): string | null {
  const subDir = `${assetId.slice(0, 2,)}/${assetId.slice(2, 4,)}`;
  const candidates: string[] = [];
  if (variant === "thumb" && thumbnailPath) {
    candidates.push(thumbnailPath,);
  }
  candidates.push(`compressed/${subDir}/${assetId}_${variant}.webp`,);
  for (const relative of candidates) {
    const absolute = getAssetFilePath(uploadDir, relative,);
    if (existsSync(absolute,)) { return absolute; }
  }
  return null;
}

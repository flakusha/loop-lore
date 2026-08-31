// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset Service — delete
 */
import { deleteFile, } from "./file-system";
import type { DeleteAssetOpts, } from "./types";

/**
 * Delete an asset record and its file.
 * @param root0
 * @param root0.database
 * @param root0.assetId
 * @param root0.uploadDir
 */
export async function deleteAsset({ database, assetId, uploadDir, }: DeleteAssetOpts,): Promise<boolean> {
  const asset = await database.selectFrom("assets",).selectAll().where("id", "=", assetId,).executeTakeFirst();
  if (!asset) { return false; }

  // Remove file
  deleteFile(uploadDir, asset.storage_path,);

  // Remove links
  await database.deleteFrom("asset_links",).where("asset_id", "=", assetId,).execute();

  // Remove record
  await database.deleteFrom("assets",).where("id", "=", assetId,).execute();

  return true;
}

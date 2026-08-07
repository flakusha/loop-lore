/**
 * Asset Service — delete
 */
import { deleteFile, } from "./file-system";
import type { DeleteAssetOpts, } from "./types";

/**
 * Delete an asset record and its file.
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

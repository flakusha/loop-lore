// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset Service — delete
 *
 * Deleting an asset also garbage-collects its matting derivatives (assets
 * linked to it with `entity_type: "asset"`). Deleting a matted derivative
 * reverts the source asset's `alpha_status` to `raw` so matting can re-run.
 */
import { AssetAlphaStatus, AssetLinkEntity, } from "../../db/enums";
import { MATTING_SOURCE_LABEL, } from "../../generation/matting/service";
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

  // If this is a matted derivative, revert the source asset to `raw`.
  if (asset.alpha_status === AssetAlphaStatus.Matted) {
    const sourceLink = await database
      .selectFrom("asset_links",)
      .select("entity_id",)
      .where("asset_id", "=", assetId,)
      .where("entity_type", "=", AssetLinkEntity.Asset,)
      .where("label", "=", MATTING_SOURCE_LABEL,)
      .executeTakeFirst();
    if (sourceLink) {
      await database
        .updateTable("assets",)
        .set({ alpha_status: AssetAlphaStatus.Raw, },)
        .where("id", "=", sourceLink.entity_id,)
        .execute();
    }
  }

  // GC matting derivatives of this asset (assets linking to it as source).
  const derivatives = await database
    .selectFrom("asset_links",)
    .select("asset_id",)
    .where("entity_type", "=", AssetLinkEntity.Asset,)
    .where("entity_id", "=", assetId,)
    .execute();

  // Remove file
  deleteFile(uploadDir, asset.storage_path,);

  // Remove links
  await database.deleteFrom("asset_links",).where("asset_id", "=", assetId,).execute();

  // Remove record
  await database.deleteFrom("assets",).where("id", "=", assetId,).execute();

  // Delete derivatives after the raw record is gone (recursive, depth-bounded
  // by the link structure: derivatives never link to other derivatives).
  for (const derivative of derivatives) {
    await deleteAsset({ database, assetId: derivative.asset_id, uploadDir, },);
  }

  return true;
}

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset Service — visibility + sharing
 */
import type { Kysely, } from "kysely";
import { AssetVisibility, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { uid, } from "../../utils";
import type { AssetRecord, ShareAssetOpts, ShareRecord, UnshareAssetOpts, UpdateVisibilityOpts, } from "./types";

/**
 * Update an asset's visibility.
 * Only the owner can change visibility.
 * @param root0
 * @param root0.database
 * @param root0.assetId
 * @param root0.visibility
 * @param root0.actorId
 */
export async function updateAssetVisibility({
  database,
  assetId,
  visibility,
  actorId,
}: UpdateVisibilityOpts,): Promise<AssetRecord | null> {
  const asset = await database.selectFrom("assets",).selectAll().where("id", "=", assetId,).executeTakeFirst();
  if (!asset) { return null; }
  if (asset.owner_id !== actorId) { return null; }

  await database.updateTable("assets",).set({ visibility, },).where("id", "=", assetId,).execute();

  return { ...asset, visibility, };
}

/**
 * Share an asset with an actor.
 * @param root0
 * @param root0.database
 * @param root0.assetId
 * @param root0.sharedWithId
 * @param root0.sharedById
 */
export async function shareAsset({
  database,
  assetId,
  sharedWithId,
  sharedById,
}: ShareAssetOpts,): Promise<ShareRecord | null> {
  const asset = await database.selectFrom("assets",).selectAll().where("id", "=", assetId,).executeTakeFirst();
  if (!asset) { return null; }
  if (asset.owner_id !== sharedById) { return null; }

  // Auto-escalate visibility to shared when first share is created
  if (asset.visibility === AssetVisibility.Private) {
    await database
      .updateTable("assets",)
      .set({ visibility: AssetVisibility.Shared, },)
      .where("id", "=", assetId,)
      .execute();
  }

  const id = uid();
  try {
    await database
      .insertInto("asset_shares",)
      .values({ id, asset_id: assetId, shared_with_id: sharedWithId, shared_by_id: sharedById, },)
      .execute();
  } catch {
    return null; /* duplicate or FK failure */
  }

  return {
    id,
    asset_id: assetId,
    shared_with_id: sharedWithId,
    shared_by_id: sharedById,
    created_at: new Date().toISOString(),
  };
}

/**
 * Unshare an asset from an actor.
 * @param root0
 * @param root0.database
 * @param root0.assetId
 * @param root0.sharedWithId
 */
export async function unshareAsset({ database, assetId, sharedWithId, }: UnshareAssetOpts,): Promise<void> {
  await database
    .deleteFrom("asset_shares",)
    .where("asset_id", "=", assetId,)
    .where("shared_with_id", "=", sharedWithId,)
    .execute();
}

/**
 * Get all shares for an asset.
 * @param database
 * @param assetId
 */
export async function getAssetShares(database: Kysely<DB>, assetId: string,): Promise<ShareRecord[]> {
  return database.selectFrom("asset_shares",).selectAll().where("asset_id", "=", assetId,).execute();
}

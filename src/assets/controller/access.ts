// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset Controller — access helpers (resolve + ownership)
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { notFoundResponse, notOwnerResponse, } from "../../routes/http-utils";
import type { AssetRecord, } from "../service";
import { canAccessAsset, getAsset, } from "../service";
import type { ResolvedAsset, } from "./types";

/**
 * @param database
 * @param assetId
 * @param actorId
 * @param actorRole
 */
export async function resolveAsset(
  database: Kysely<DB>,
  assetId: string,
  actorId: string | null,
  actorRole: string | null,
): Promise<ResolvedAsset | Response> {
  const allowed = await canAccessAsset(database, assetId, actorId, actorRole,);
  if (!allowed) {
    return notFoundResponse();
  }

  const asset = await getAsset(database, assetId,);
  if (!asset) {
    return notFoundResponse("Asset not found",);
  }

  return { asset, };
}

/**
 * Load an asset and require the caller to be its owner.
 * Returns the asset on success, or a Response on failure.
 * @param database
 * @param assetId
 * @param userId
 */
export async function requireAssetOwner(
  database: Kysely<DB>,
  assetId: string,
  userId: string,
): Promise<AssetRecord | Response> {
  const asset = await database
    .selectFrom("assets",)
    .selectAll()
    .where("id", "=", assetId,)
    .executeTakeFirst();
  if (!asset) { return notFoundResponse("Asset not found",); }
  if (asset.owner_id !== userId) { return notOwnerResponse("Asset",); }
  return asset;
}

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset Service — entity links
 */
import type { Kysely, } from "kysely";
import type { AssetLinkEntity, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import type { LinkAssetOpts, UnlinkAssetOpts, } from "./types";

/**
 * Link an asset to an entity.
 */
export async function linkAsset({ database, assetId, link, }: LinkAssetOpts,): Promise<void> {
  try {
    await database
      .insertInto("asset_links",)
      .values({
        asset_id: assetId,
        entity_type: link.entityType,
        entity_id: link.entityId,
        label: link.label ?? null,
      },)
      .execute();
  } catch {
    /* ignore duplicate */
  }
}

/**
 * Unlink an asset from an entity.
 */
export async function unlinkAsset({
  database,
  assetId,
  entityType,
  entityId,
}: UnlinkAssetOpts,): Promise<void> {
  await database
    .deleteFrom("asset_links",)
    .where("asset_id", "=", assetId,)
    .where("entity_type", "=", entityType,)
    .where("entity_id", "=", entityId,)
    .execute();
}

/**
 * Get all links for an asset.
 */
export async function getAssetLinks(
  database: Kysely<DB>,
  assetId: string,
): Promise<{ entity_type: AssetLinkEntity; entity_id: string; label: string | null }[]> {
  return database
    .selectFrom("asset_links",)
    .select(["entity_type", "entity_id", "label",],)
    .where("asset_id", "=", assetId,)
    .execute();
}

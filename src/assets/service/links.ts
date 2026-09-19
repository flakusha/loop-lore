// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset Service — entity links
 */
import type { Kysely, } from "kysely";
import type { AssetLinkEntity, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import type { DeleteAssetLinkOpts, LinkAssetOpts, UnlinkAssetOpts, } from "./types";

/**
 * Link an asset to an entity. Re-linking the same asset/entity pair is an
 * expected no-op; any other insert failure (e.g. FK violation for a
 * nonexistent entity) propagates to the caller.
 * @param root0
 * @param root0.database
 * @param root0.assetId
 * @param root0.link
 * @returns Promise<unknown>
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
  } catch (error) {
    if (!(error instanceof Error && error.message.includes("UNIQUE constraint failed",))) {
      throw error;
    }
  }
}

/**
 * Unlink an asset from an entity.
 * @param root0
 * @param root0.database
 * @param root0.assetId
 * @param root0.entityType
 * @param root0.entityId
 * @returns void
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
 * Delete a single link of an asset by its identifier (the linked entity's id).
 * `asset_links` PK is `(asset_id, entity_type, entity_id)`; deleting by
 * `asset_id` + `entity_id` alone over-deletes when the same `entity_id` is
 * linked under multiple `entity_type`s (e.g. an asset linked to both
 * `character:42` and `world:42`). Resolve to one exact row first and
 * refuse the operation when the match is ambiguous — the caller needs a
 * path that includes `entity_type` to disambiguate.
 * @param root0
 * @param root0.database
 * @param root0.assetId
 * @param root0.linkId
 * @returns true when exactly one link row was deleted, false when none matched
 * @throws when more than one link shares the same `(asset_id, entity_id)` pair
 */
export async function deleteAssetLink({
  database,
  assetId,
  linkId,
}: DeleteAssetLinkOpts,): Promise<boolean> {
  const matches = await database
    .selectFrom("asset_links",)
    .select(["entity_type", "entity_id",],)
    .where("asset_id", "=", assetId,)
    .where("entity_id", "=", linkId,)
    .execute();
  if (matches.length === 0) { return false; }
  if (matches.length > 1) {
    throw new Error(
      `Ambiguous link delete: asset ${assetId} has ${matches.length} links with entity_id='${linkId}' across entity_types [${
        matches.map((m,) => m.entity_type).join(", ",)
      }]. Pass entity_type to disambiguate.`,
      { cause: { matches, }, },
    );
  }
  const only = matches[0];
  if (!only) {
    return false;
  }
  const result = await database
    .deleteFrom("asset_links",)
    .where("asset_id", "=", assetId,)
    .where("entity_type", "=", only.entity_type,)
    .where("entity_id", "=", linkId,)
    .executeTakeFirst();
  return Number(result.numDeletedRows,) === 1;
}

/**
 * Get all links for an asset.
 * @param database
 * @param assetId
 * @returns void
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

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset Service — read/access (get, list, decrypt, ownership)
 */
import type { ExpressionBuilder, Kysely, } from "kysely";
import { existsSync, readFileSync, } from "node:fs";
import { decryptAssetBlob, } from "../../crypto/asset-encryption";
import type { ChatKey, } from "../../crypto/chat-keys";
import { AssetVisibility, } from "../../db/enums";
import type { AssetLinkEntity, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { can, } from "../../users/permissions";
import { getAssetFilePath, } from "./file-system";
import type { AssetRecord, } from "./types";

/**
 * Get a single asset by ID.
 * @param database
 * @param assetId
 */
export async function getAsset(database: Kysely<DB>, assetId: string,): Promise<AssetRecord | null> {
  const asset = await database.selectFrom("assets",).selectAll().where("id", "=", assetId,).executeTakeFirst();
  return (asset as AssetRecord | null) ?? null;
}

/**
 * Get decrypted asset data. If asset is encrypted, decrypts using provided chat key.
 * If asset is not encrypted, returns raw file data.
 * @param database - Database connection
 * @param assetId - Asset ID
 * @param uploadDir - Upload directory path
 * @param chatKey - Chat key for decryption (optional, required for encrypted assets)
 * @returns Decrypted buffer or null if asset not found
 */
export async function getAssetData(
  database: Kysely<DB>,
  assetId: string,
  uploadDir: string,
  chatKey?: ChatKey,
): Promise<Buffer | null> {
  const asset = await getAsset(database, assetId,);
  if (!asset) { return null; }

  const filePath = getAssetFilePath(uploadDir, asset.storage_path,);
  if (!existsSync(filePath,)) { return null; }

  const fileData = readFileSync(filePath,);

  // If asset is encrypted, decrypt it (per-asset HKDF subkey derives from chatKey + assetId)
  if (asset.encryption_tier !== "public" && asset.encrypted_key_id) {
    if (!chatKey) {
      throw new Error("Chat key required to decrypt encrypted asset",);
    }
    return decryptAssetBlob(fileData, chatKey, asset.id,);
  }

  return fileData;
}

/**
 * Check if an asset is encrypted.
 * @param database
 * @param assetId
 */
export async function isAssetEncrypted(
  database: Kysely<DB>,
  assetId: string,
): Promise<boolean> {
  const asset = await getAsset(database, assetId,);
  if (!asset) { return false; }
  return asset.encryption_tier !== "public" && asset.encrypted_key_id !== null;
}

/**
 * Build an OR filter for asset visibility: public, owned by the actor, or
 * shared with the actor via an explicit `asset_shares` row. Pass tablePrefix ""
 * for unjoined queries, "assets." for joined queries.
 * @param eb
 * @param actorId
 * @param tablePrefix
 */
export function visibleAssetFilter(
  eb: ExpressionBuilder<DB, "assets">,
  actorId: string,
  tablePrefix = "",
) {
  const visibilityColumn: "visibility" | "assets.visibility" = tablePrefix === "" ? "visibility" : "assets.visibility";
  const ownerColumn: "owner_id" | "assets.owner_id" = tablePrefix === "" ? "owner_id" : "assets.owner_id";
  const idColumn: "id" | "assets.id" = tablePrefix === "" ? "id" : "assets.id";
  return eb.or([
    eb(visibilityColumn, "=", AssetVisibility.Public,),
    eb(ownerColumn, "=", actorId,),
    eb.and([
      eb(visibilityColumn, "=", AssetVisibility.Shared,),
      eb.exists(
        eb.selectFrom("asset_shares",)
          .select("asset_shares.id",)
          .whereRef("asset_shares.asset_id", "=", idColumn,)
          .where("asset_shares.shared_with_id", "=", actorId,),
      ),
    ],),
  ],);
}

/**
 * List assets with optional filters (entity_type, entity_id, label).
 * @param database
 * @param options
 * @param options.page
 * @param options.pageSize
 * @param options.entityType
 * @param options.entityId
 * @param options.label
 * @param options.actorId
 * @param options.actorRole
 */
export async function listAssets(
  database: Kysely<DB>,
  options: {
    page?: number;
    pageSize?: number;
    entityType?: AssetLinkEntity;
    entityId?: string;
    label?: string;
    actorId?: string | null;
    actorRole?: string | null;
  } = {},
): Promise<{ data: AssetRecord[]; total: number }> {
  const page = options.page ?? 1;
  const pageSize = Math.min(options.pageSize ?? 50, 200,);
  const offset = (page - 1) * pageSize;
  const isAdmin = can(options.actorRole, "admin.character",);
  const actorId = options.actorId ?? "";

  // If entity filter is provided, join through asset_links
  if (options.entityType || options.entityId) {
    let countQuery = database
      .selectFrom("assets",)
      .innerJoin("asset_links", "assets.id", "asset_links.asset_id",)
      .select(database.fn.countAll<number>().as("total",),);

    let listQuery = database
      .selectFrom("assets",)
      .innerJoin("asset_links", "assets.id", "asset_links.asset_id",)
      .selectAll("assets",);

    if (options.entityType) {
      countQuery = countQuery.where("asset_links.entity_type", "=", options.entityType,);
      listQuery = listQuery.where("asset_links.entity_type", "=", options.entityType,);
    }
    if (options.entityId) {
      countQuery = countQuery.where("asset_links.entity_id", "=", options.entityId,);
      listQuery = listQuery.where("asset_links.entity_id", "=", options.entityId,);
    }
    if (options.label) {
      countQuery = countQuery.where("asset_links.label", "=", options.label,);
      listQuery = listQuery.where("asset_links.label", "=", options.label,);
    }

    // Apply visibility filter (admin sees all)
    if (!isAdmin) {
      countQuery = countQuery.where((eb,) => visibleAssetFilter(eb, actorId, "assets.",));
      listQuery = listQuery.where((eb,) => visibleAssetFilter(eb, actorId, "assets.",));
    }

    const countResult = await countQuery.executeTakeFirst();
    const total = countResult?.total ?? 0;
    const data = await listQuery
      .orderBy("assets.created_at", "desc",)
      .limit(pageSize,)
      .offset(offset,)
      .execute();

    return { data: data as unknown as AssetRecord[], total, };
  }

  // No filter — list all assets (with visibility filter)
  let countQuery = database
    .selectFrom("assets",)
    .select(database.fn.countAll<number>().as("total",),);

  let listQuery = database
    .selectFrom("assets",)
    .selectAll();

  if (!isAdmin) {
    countQuery = countQuery.where((eb,) => visibleAssetFilter(eb, actorId,));
    listQuery = listQuery.where((eb,) => visibleAssetFilter(eb, actorId,));
  }

  const countResult = await countQuery.executeTakeFirst();
  const total = countResult?.total ?? 0;

  const data = await listQuery
    .orderBy("created_at", "desc",)
    .limit(pageSize,)
    .offset(offset,)
    .execute();

  return { data: data as unknown as AssetRecord[], total, };
}

/**
 * Check if an actor can access an asset.
 * Owner always yes. Admin always yes. Public asset → any auth user.
 * Shared asset → check asset_shares. Private → owner only.
 * @param database
 * @param assetId
 * @param actorId
 * @param actorRole
 */
export async function canAccessAsset(
  database: Kysely<DB>,
  assetId: string,
  actorId: string | null,
  actorRole: string | null,
): Promise<boolean> {
  if (can(actorRole, "admin.character",)) { return true; }

  const asset = await database.selectFrom("assets",).selectAll().where("id", "=", assetId,).executeTakeFirst();
  if (!asset) { return false; }
  if (actorId && asset.owner_id === actorId) { return true; }
  if (actorId && asset.visibility === AssetVisibility.Public) { return true; }
  if (actorId && asset.visibility === AssetVisibility.Shared) {
    const share = await database
      .selectFrom("asset_shares",)
      .select("id",)
      .where("asset_id", "=", assetId,)
      .where("shared_with_id", "=", actorId,)
      .executeTakeFirst();
    if (share) { return true; }
  }
  return false;
}

/**
 * Asset Service — read/access (get, list, decrypt, ownership)
 */
import type { Kysely, } from "kysely";
import { existsSync, readFileSync, } from "node:fs";
import { decryptAssetBlob, } from "../../crypto/asset-encryption";
import type { ChatKey, } from "../../crypto/chat-keys";
import { AssetVisibility, } from "../../db/enums";
import type { AssetLinkEntity, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getAssetFilePath, } from "./file-system";
import type { AssetRecord, } from "./types";

/**
 * Get a single asset by ID.
 */
export async function getAsset(database: Kysely<DB>, assetId: string,): Promise<AssetRecord | null> {
  const asset = await database.selectFrom("assets",).selectAll().where("id", "=", assetId,).executeTakeFirst();
  return (asset as AssetRecord | null) ?? null;
}

/**
 * Get decrypted asset data. If asset is encrypted, decrypts using provided chat key.
 * If asset is not encrypted, returns raw file data.
 *
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

  // If asset is encrypted, decrypt it
  if (asset.encryption_tier !== "public" && asset.encrypted_key_id) {
    if (!chatKey) {
      throw new Error("Chat key required to decrypt encrypted asset",);
    }
    return decryptAssetBlob(fileData, chatKey,);
  }

  return fileData;
}

/**
 * Check if an asset is encrypted.
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
 * Build an OR filter for asset visibility: public, owned by actor, or shared.
 * Pass tablePrefix "" for unjoined queries, "assets." for joined queries.
 */
function visibilityFilter(
  eb: any,
  actorId: string,
  tablePrefix: string,
) {
  return eb.or([
    eb(`${tablePrefix}visibility`, "=", AssetVisibility.Public,),
    eb(`${tablePrefix}owner_id`, "=", actorId,),
    eb(`${tablePrefix}visibility`, "=", AssetVisibility.Shared,),
  ],);
}

/**
 * List assets with optional filters (entity_type, entity_id, label).
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
  const isAdmin = options.actorRole === "admin";
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
      countQuery = countQuery.where((eb,) => visibilityFilter(eb, actorId, "assets.",));
      listQuery = listQuery.where((eb,) => visibilityFilter(eb, actorId, "assets.",));
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
    countQuery = countQuery.where((eb,) => visibilityFilter(eb, actorId, "",));
    listQuery = listQuery.where((eb,) => visibilityFilter(eb, actorId, "",));
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
 */
export async function canAccessAsset(
  database: Kysely<DB>,
  assetId: string,
  actorId: string | null,
  actorRole: string | null,
): Promise<boolean> {
  if (actorRole === "admin") { return true; }

  const asset = await database.selectFrom("assets",).selectAll().where("id", "=", assetId,).executeTakeFirst();
  if (!asset) { return false; }
  if (asset.owner_id === actorId) { return true; }
  if (asset.visibility === AssetVisibility.Public && actorId) { return true; }
  if (asset.visibility === AssetVisibility.Shared && actorId) {
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

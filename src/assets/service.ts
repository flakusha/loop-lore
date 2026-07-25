/**
 * Asset Service
 *
 * Core CRUD operations for the polymorphic asset system.
 * Handles file storage (local), DB records, and linking.
 */
import type { Kysely, } from "kysely";
import { existsSync, mkdirSync, unlinkSync, writeFileSync, } from "node:fs";
import { join, resolve, } from "node:path";
import type { AssetType as AssetTypeT, } from "../db/enums";
import { AssetLinkEntity, AssetType, AssetVisibility, StorageBackend, } from "../db/enums";
import type { DB, } from "../db/schema";
import { uid, } from "../utils";
import { extractImageMetadata, } from "./metadata";

export interface AssetRecord {
  id: string;
  owner_id: string;
  filename: string;
  mime_type: string;
  asset_type: AssetTypeT;
  size_bytes: number;
  storage_path: string;
  storage_backend: StorageBackend;
  visibility: AssetVisibility;
  width: number | null;
  height: number | null;
  duration_secs: number | null;
  alt_text: string | null;
  created_at: string;
}

export interface CreateAssetInput {
  ownerId: string;
  filename: string;
  mimeType: string;
  assetType: AssetTypeT;
  sizeBytes: number;
  buffer: Buffer;
  altText?: string;
  width?: number;
  height?: number;
}

export interface AssetLinkInput {
  entityType: AssetLinkEntity;
  entityId: string;
  label?: string;
}

/**
 * Detect asset type from MIME type.
 */
export function detectAssetType(mime: string,): AssetTypeT {
  if (mime.startsWith("image/",)) { return AssetType.Image; }
  if (mime.startsWith("audio/",)) { return AssetType.Audio; }
  if (mime.startsWith("video/",)) { return AssetType.Video; }
  return AssetType.Other;
}

/**
 * Detect MIME type from file extension.
 */
export function mimeFromExtension(filename: string,): string {
  const ext = filename.split(".",).pop()?.toLowerCase() ?? "";
  const MIME_MAP: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    avif: "image/avif",
    gif: "image/gif",
    svg: "image/svg+xml",
    ogg: "audio/ogg",
    opus: "audio/opus",
    mp3: "audio/mpeg",
    flac: "audio/flac",
    wav: "audio/wav",
    webm: "video/webm",
    mp4: "video/mp4",
    mkv: "video/x-matroska",
    pdf: "application/pdf",
    json: "application/json",
    txt: "text/plain",
  };
  return MIME_MAP[ext] ?? "application/octet-stream";
}

/**
 * Dangerous root paths that must never be used as upload directories.
 */
const FORBIDDEN_ROOTS = ["/", "/home", "/root", "/etc", "/usr", "/bin", "/lib", "/var", "/opt",];

/**
 * Resolve the upload directory path from config.
 * Supports both absolute and relative paths.
 * Throws if resolved path is a forbidden system root.
 */
function resolveUploadDir(uploadDir: string,): string {
  const resolved = uploadDir.startsWith("/",) ? uploadDir : join(process.cwd(), uploadDir,);
  const normalized = resolve(resolved,);

  // Block dangerous system roots
  for (const forbidden of FORBIDDEN_ROOTS) {
    if (normalized === forbidden || normalized.startsWith(`${forbidden}/`,)) {
      // /home is special: block root and direct children (/home/user),
      // but allow deeper paths (/home/user/projects)
      if (forbidden === "/home" && normalized !== "/home") {
        const afterHome = normalized.slice(forbidden.length + 1,);
        if (afterHome.includes("/",)) { continue; }
      }
      throw new Error(`Upload directory "${resolved}" resolves to forbidden system path "${normalized}"`,);
    }
  }

  return normalized;
}

/**
 * Store a file on the local filesystem.
 * Returns the relative storage path (e.g., "ab/cd/uuid.jpg").
 */
function storeFile(uploadDir: string, assetId: string, filename: string, buffer: Buffer,): string {
  const subDir = `${assetId.slice(0, 2,)}/${assetId.slice(2, 4,)}`;
  const fullDir = join(resolveUploadDir(uploadDir,), "raw", subDir,);
  mkdirSync(fullDir, { recursive: true, },);

  // Preserve extension
  const ext = filename.split(".",).pop()?.toLowerCase() ?? "";
  const storageFilename = ext ? `${assetId}.${ext}` : assetId;
  const storagePath = `raw/${subDir}/${storageFilename}`;

  writeFileSync(join(resolveUploadDir(uploadDir,), storagePath,), buffer,);
  return storagePath;
}

/**
 * Delete a file from the local filesystem.
 */
function deleteFile(uploadDir: string, storagePath: string,): void {
  const fullPath = join(resolveUploadDir(uploadDir,), storagePath,);
  if (existsSync(fullPath,)) { unlinkSync(fullPath,); }
}

export interface CreateAssetOpts {
  database: Kysely<DB>;
  input: CreateAssetInput;
  uploadDir: string;
}

export interface DeleteAssetOpts {
  database: Kysely<DB>;
  assetId: string;
  uploadDir: string;
}

export interface UnlinkAssetOpts {
  database: Kysely<DB>;
  assetId: string;
  entityType: AssetLinkEntity;
  entityId: string;
}

export interface LinkAssetOpts {
  database: Kysely<DB>;
  assetId: string;
  link: AssetLinkInput;
}

export interface ShareRecord {
  id: string;
  asset_id: string;
  shared_with_id: string;
  shared_by_id: string;
  created_at: string;
}

export interface UpdateVisibilityOpts {
  database: Kysely<DB>;
  assetId: string;
  visibility: AssetVisibility;
  actorId: string;
}

export interface ShareAssetOpts {
  database: Kysely<DB>;
  assetId: string;
  sharedWithId: string;
  sharedById: string;
}

export interface UnshareAssetOpts {
  database: Kysely<DB>;
  assetId: string;
  sharedWithId: string;
}

// ── Service functions ──────────────────────────────────────────

/**
 * Create an asset record and store the file.
 */
export async function createAsset({ database, input, uploadDir, }: CreateAssetOpts,): Promise<AssetRecord> {
  const id = uid();
  const storagePath = storeFile(uploadDir, id, input.filename, input.buffer,);

  // Extract image metadata from buffer headers
  let width = input.width ?? null;
  let height = input.height ?? null;
  let altText = input.altText ?? null;
  if (input.mimeType.startsWith("image/",)) {
    const meta = extractImageMetadata(input.buffer,);
    if (width === null && meta.width > 0) { width = meta.width; }
    if (height === null && meta.height > 0) { height = meta.height; }
    if (altText === null && meta.caption) { altText = meta.caption; }
  }

  // Sanitize alt_text: strip HTML tags, limit length
  if (altText) {
    altText = altText.replaceAll(/<[^>]*>/g, "",).trim().slice(0, 500,);
  }

  const asset: AssetRecord = {
    id,
    owner_id: input.ownerId,
    filename: input.filename,
    mime_type: input.mimeType,
    asset_type: input.assetType,
    size_bytes: input.sizeBytes,
    storage_path: storagePath,
    storage_backend: StorageBackend.Local,
    visibility: AssetVisibility.Private,
    width,
    height,
    duration_secs: null,
    alt_text: altText,
    created_at: new Date().toISOString(),
  };

  await database
    .insertInto("assets",)
    .values({
      id: asset.id,
      owner_id: asset.owner_id,
      filename: asset.filename,
      mime_type: asset.mime_type,
      asset_type: asset.asset_type,
      size_bytes: asset.size_bytes,
      storage_path: asset.storage_path,
      storage_backend: asset.storage_backend,
      visibility: asset.visibility,
      width: asset.width,
      height: asset.height,
      duration_secs: asset.duration_secs,
      alt_text: asset.alt_text,
    },)
    .execute();

  return asset;
}

/**
 * List assets with optional filters (entity_type, entity_id, label).
 */
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
 * Get a single asset by ID.
 */
export async function getAsset(database: Kysely<DB>, assetId: string,): Promise<AssetRecord | null> {
  const asset = await database.selectFrom("assets",).selectAll().where("id", "=", assetId,).executeTakeFirst();
  return (asset as AssetRecord | null) ?? null;
}

/**
 * Resolve the full file path for serving.
 */
export function getAssetFilePath(uploadDir: string, storagePath: string,): string {
  return join(resolveUploadDir(uploadDir,), storagePath,);
}

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

/**
 * Update an asset's visibility.
 * Only the owner can change visibility.
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
 */
export async function getAssetShares(database: Kysely<DB>, assetId: string,): Promise<ShareRecord[]> {
  return database.selectFrom("asset_shares",).selectAll().where("asset_id", "=", assetId,).execute();
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

/**
 * Validate file size against config limit.
 */
export function validateFileSize(sizeBytes: number, maxSize: number,): string | null {
  if (sizeBytes > maxSize) {
    const maxMb = (maxSize / 1_048_576).toFixed(0,);
    return `File too large. Maximum size is ${maxMb} MB.`;
  }
  return null;
}

/**
 * Validate MIME type is allowed.
 */
const ALLOWED_MIME_PREFIXES = [
  "image/",
  "audio/",
  "video/",
  "application/pdf",
  "text/plain",
  "application/json",
];

export function validateMimeType(mime: string,): string | null {
  const allowed = ALLOWED_MIME_PREFIXES.some((prefix,) => mime.startsWith(prefix,));
  if (!allowed) { return `Unsupported file type: ${mime}`; }
  return null;
}

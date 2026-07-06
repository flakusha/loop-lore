/**
 * Asset Service
 *
 * Core CRUD operations for the polymorphic asset system.
 * Handles file storage (local), DB records, and linking.
 */

import { writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import { AssetType, StorageBackend } from "../db/enums";
import type { AssetType as AssetTypeT } from "../db/enums";
import { uid } from "../utils";
import { extractImageMetadata } from "./metadata";

export interface AssetRecord {
  id: string;
  owner_id: string;
  filename: string;
  mime_type: string;
  asset_type: AssetTypeT;
  size_bytes: number;
  storage_path: string;
  storage_backend: StorageBackend;
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
  entityType: string;
  entityId: string;
  label?: string;
}

/**
 * Detect asset type from MIME type.
 */
export function detectAssetType(mime: string): AssetTypeT {
  if (mime.startsWith("image/")) return AssetType.Image;
  if (mime.startsWith("audio/")) return AssetType.Audio;
  if (mime.startsWith("video/")) return AssetType.Video;
  return AssetType.Other;
}

/**
 * Detect MIME type from file extension.
 */
export function mimeFromExtension(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
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
const FORBIDDEN_ROOTS = ["/", "/home", "/root", "/etc", "/usr", "/bin", "/lib", "/var", "/opt"];

/**
 * Resolve the upload directory path from config.
 * Supports both absolute and relative paths.
 * Throws if resolved path is a forbidden system root.
 */
function resolveUploadDir(uploadDir: string): string {
  const resolved = uploadDir.startsWith("/") ? uploadDir : join(process.cwd(), uploadDir);
  const normalized = resolve(resolved);

  // Block dangerous system roots
  for (const forbidden of FORBIDDEN_ROOTS) {
    if (normalized === forbidden || normalized.startsWith(forbidden + "/")) {
      // /home is special: block root and direct children (/home/user),
      // but allow deeper paths (/home/user/projects)
      if (forbidden === "/home" && normalized !== "/home") {
        const afterHome = normalized.slice(forbidden.length + 1);
        if (afterHome.includes("/")) continue;
      }
      throw new Error(`Upload directory "${resolved}" resolves to forbidden system path "${normalized}"`);
    }
  }

  return normalized;
}

/**
 * Store a file on the local filesystem.
 * Returns the relative storage path (e.g., "ab/cd/uuid.jpg").
 */
function storeFile(uploadDir: string, assetId: string, filename: string, buffer: Buffer): string {
  const subDir = `${assetId.slice(0, 2)}/${assetId.slice(2, 4)}`;
  const fullDir = join(resolveUploadDir(uploadDir), "raw", subDir);
  mkdirSync(fullDir, { recursive: true });

  // Preserve extension
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const storageFilename = ext ? `${assetId}.${ext}` : assetId;
  const storagePath = `raw/${subDir}/${storageFilename}`;

  writeFileSync(join(resolveUploadDir(uploadDir), storagePath), buffer);
  return storagePath;
}

/**
 * Delete a file from the local filesystem.
 */
function deleteFile(uploadDir: string, storagePath: string): void {
  const fullPath = join(resolveUploadDir(uploadDir), storagePath);
  if (existsSync(fullPath)) unlinkSync(fullPath);
}

// ── Service functions ──────────────────────────────────────────

/**
 * Create an asset record and store the file.
 */
export async function createAsset(
  database: Kysely<DB>,
  input: CreateAssetInput,
  uploadDir: string,
): Promise<AssetRecord> {
  const id = uid();
  const storagePath = storeFile(uploadDir, id, input.filename, input.buffer);

  // Extract image metadata from buffer headers
  let width = input.width ?? null;
  let height = input.height ?? null;
  let altText = input.altText ?? null;
  if (input.mimeType.startsWith("image/")) {
    const meta = extractImageMetadata(input.buffer);
    if (width === null && meta.width > 0) width = meta.width;
    if (height === null && meta.height > 0) height = meta.height;
    if (altText === null && meta.caption) altText = meta.caption;
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
    width,
    height,
    duration_secs: null,
    alt_text: altText,
    created_at: new Date().toISOString(),
  };

  await database
    .insertInto("assets")
    .values({
      id: asset.id,
      owner_id: asset.owner_id,
      filename: asset.filename,
      mime_type: asset.mime_type,
      asset_type: asset.asset_type,
      size_bytes: asset.size_bytes,
      storage_path: asset.storage_path,
      storage_backend: asset.storage_backend,
      width: asset.width,
      height: asset.height,
      duration_secs: asset.duration_secs,
      alt_text: asset.alt_text,
    })
    .execute();

  return asset;
}

/**
 * List assets with optional filters (entity_type, entity_id, label).
 */
export async function listAssets(
  database: Kysely<DB>,
  options: { page?: number; pageSize?: number; entityType?: string; entityId?: string; label?: string } = {},
): Promise<{ data: AssetRecord[]; total: number }> {
  const page = options.page ?? 1;
  const pageSize = Math.min(options.pageSize ?? 50, 200);
  const offset = (page - 1) * pageSize;

  // If entity filter is provided, join through asset_links
  if (options.entityType || options.entityId) {
    let countQuery = database
      .selectFrom("assets")
      .innerJoin("asset_links", "assets.id", "asset_links.asset_id")
      .select(database.fn.countAll<number>().as("total"));

    let listQuery = database
      .selectFrom("assets")
      .innerJoin("asset_links", "assets.id", "asset_links.asset_id")
      .selectAll("assets");

    if (options.entityType) {
      countQuery = countQuery.where("asset_links.entity_type", "=", options.entityType);
      listQuery = listQuery.where("asset_links.entity_type", "=", options.entityType);
    }
    if (options.entityId) {
      countQuery = countQuery.where("asset_links.entity_id", "=", options.entityId);
      listQuery = listQuery.where("asset_links.entity_id", "=", options.entityId);
    }
    if (options.label) {
      countQuery = countQuery.where("asset_links.label", "=", options.label);
      listQuery = listQuery.where("asset_links.label", "=", options.label);
    }

    const countResult = await countQuery.executeTakeFirst();
    const total = countResult?.total ?? 0;
    const data = await listQuery
      .orderBy("assets.created_at", "desc")
      .limit(pageSize)
      .offset(offset)
      .execute();

    return { data: data as unknown as AssetRecord[], total };
  }

  // No filter — list all assets
  const countResult = await database
    .selectFrom("assets")
    .select(database.fn.countAll<number>().as("total"))
    .executeTakeFirst();
  const total = countResult?.total ?? 0;

  const data = await database
    .selectFrom("assets")
    .selectAll()
    .orderBy("created_at", "desc")
    .limit(pageSize)
    .offset(offset)
    .execute();

  return { data: data as unknown as AssetRecord[], total };
}

/**
 * Get a single asset by ID.
 */
export async function getAsset(database: Kysely<DB>, assetId: string): Promise<AssetRecord | null> {
  const asset = await database.selectFrom("assets").selectAll().where("id", "=", assetId).executeTakeFirst();
  return (asset as AssetRecord | null) ?? null;
}

/**
 * Resolve the full file path for serving.
 */
export function getAssetFilePath(uploadDir: string, storagePath: string): string {
  return join(resolveUploadDir(uploadDir), storagePath);
}

/**
 * Delete an asset record and its file.
 */
export async function deleteAsset(
  database: Kysely<DB>,
  assetId: string,
  uploadDir: string,
): Promise<boolean> {
  const asset = await database.selectFrom("assets").selectAll().where("id", "=", assetId).executeTakeFirst();
  if (!asset) return false;

  // Remove file
  deleteFile(uploadDir, asset.storage_path);

  // Remove links
  await database.deleteFrom("asset_links").where("asset_id", "=", assetId).execute();

  // Remove record
  await database.deleteFrom("assets").where("id", "=", assetId).execute();

  return true;
}

/**
 * Link an asset to an entity.
 */
export async function linkAsset(database: Kysely<DB>, assetId: string, link: AssetLinkInput): Promise<void> {
  try {
    await database
      .insertInto("asset_links")
      .values({
        asset_id: assetId,
        entity_type: link.entityType,
        entity_id: link.entityId,
        label: link.label ?? null,
      })
      .execute();
  } catch {
    /* ignore duplicate */
  }
}

/**
 * Unlink an asset from an entity.
 */
export async function unlinkAsset(
  database: Kysely<DB>,
  assetId: string,
  entityType: string,
  entityId: string,
): Promise<void> {
  await database
    .deleteFrom("asset_links")
    .where("asset_id", "=", assetId)
    .where("entity_type", "=", entityType)
    .where("entity_id", "=", entityId)
    .execute();
}

/**
 * Get all links for an asset.
 */
export async function getAssetLinks(
  database: Kysely<DB>,
  assetId: string,
): Promise<{ entity_type: string; entity_id: string; label: string | null }[]> {
  return database
    .selectFrom("asset_links")
    .select(["entity_type", "entity_id", "label"])
    .where("asset_id", "=", assetId)
    .execute();
}

/**
 * Validate file size against config limit.
 */
export function validateFileSize(sizeBytes: number, maxSize: number): string | null {
  if (sizeBytes > maxSize) {
    const maxMb = (maxSize / 1_048_576).toFixed(0);
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

export function validateMimeType(mime: string): string | null {
  const allowed = ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
  if (!allowed) return `Unsupported file type: ${mime}`;
  return null;
}

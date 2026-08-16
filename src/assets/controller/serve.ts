// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset Controller — serve/download handlers
 */
import { existsSync, } from "node:fs";
import { IMMUTABLE_CACHE_MAX_AGE, } from "../../config/constants";
import { deriveChatKeyForChat, getSmk, } from "../../crypto";
import { forbiddenResponse, notFoundResponse, } from "../../routes/http-utils";
import { getAsset, getAssetData, getAssetFilePath, } from "../service";
import type { AssetRecord, } from "../service";
import { resolveAsset, } from "./access";
import { serveFile, } from "./files";
import { verifyAssetUrl, } from "./signed-url";
import type { ServeCompressedOpts, ServeRawOpts, } from "./types";

/**
 * Resolve the actor-facing asset record for a serve request.
 *
 * When a signed-URL token is present, authentication is delegated to the token
 * (the signed URL already encodes an authorized asset + action + expiry); the
 * actor fields are ignored. Otherwise the caller must pass the actor-based
 * access check via `resolveAsset`.
 *
 * Returns `{ asset, response? }` — `response` is non-null on failure.
 */
async function resolveForServe(
  opts: ServeRawOpts,
): Promise<{ asset: AssetRecord } | { response: Response }> {
  if (opts.signedUrlToken) {
    if (!opts.signedUrlSecret) {
      return { response: forbiddenResponse("Signed URL unavailable",), };
    }
    if (!opts.signedUrlAction || !Number.isFinite(opts.signedUrlExpires ?? NaN,)) {
      return { response: forbiddenResponse("Invalid signed URL",), };
    }
    const result = await verifyAssetUrl({
      secret: opts.signedUrlSecret,
      token: opts.signedUrlToken,
      assetId: opts.assetId,
      action: opts.signedUrlAction,
      expiresAt: opts.signedUrlExpires!,
    },);
    if (!result.valid) {
      return { response: forbiddenResponse("Invalid or expired signed URL",), };
    }
    // Token authorizes this asset — load it without the actor gate.
    const asset = await getAsset(opts.database, opts.assetId,);
    if (!asset) {
      return { response: notFoundResponse("Asset not found",), };
    }
    return { asset, };
  }

  const resolved = await resolveAsset(opts.database, opts.assetId, opts.actorId, opts.actorRole,);
  if (resolved instanceof Response) { return { response: resolved, }; }
  return { asset: resolved.asset, };
}

export async function handleServeRaw({
  database,
  assetId,
  uploadDir,
  actorId,
  actorRole,
  chatId,
  signedUrlSecret,
  signedUrlToken,
  signedUrlExpires,
  signedUrlAction,
}: ServeRawOpts & { chatId?: string },): Promise<Response> {
  const resolved = await resolveForServe({
    database,
    assetId,
    uploadDir,
    actorId,
    actorRole,
    signedUrlSecret,
    signedUrlToken,
    signedUrlExpires,
    signedUrlAction,
  },);
  if ("response" in resolved) { return resolved.response; }
  const { asset, } = resolved;

  // If asset is encrypted, try to decrypt
  if (asset.encryption_tier !== "public" && asset.encrypted_key_id) {
    try {
      // Get SMK and derive chat key if chatId provided
      const smk = getSmk();
      if (!smk || !chatId) {
        return new Response("Encrypted asset requires chat context", { status: 400, },);
      }

      const chatKey = await deriveChatKeyForChat(database, chatId, smk,);
      const decryptedData = await getAssetData(database, assetId, uploadDir, chatKey,);

      if (!decryptedData) {
        return notFoundResponse("Failed to decrypt asset",);
      }

      return new Response(new Uint8Array(decryptedData,), {
        headers: {
          "Content-Type": asset.mime_type,
          "Cache-Control": `public, max-age=${IMMUTABLE_CACHE_MAX_AGE}, immutable`,
        },
      },);
    } catch {
      return new Response("Failed to decrypt asset", { status: 500, },);
    }
  }

  // Non-encrypted asset — serve directly
  return serveFile(getAssetFilePath(uploadDir, asset.storage_path,), asset.mime_type,);
}

export async function handleServeCompressed({
  database,
  assetId,
  uploadDir,
  variant,
  actorId,
  actorRole,
  signedUrlSecret,
  signedUrlToken,
  signedUrlExpires,
  signedUrlAction,
}: ServeCompressedOpts,): Promise<Response> {
  const resolved = await resolveForServe({
    database,
    assetId,
    uploadDir,
    actorId,
    actorRole,
    signedUrlSecret,
    signedUrlToken,
    signedUrlExpires,
    signedUrlAction,
  },);
  if ("response" in resolved) { return resolved.response; }

  const subDir = `${assetId.slice(0, 2,)}/${assetId.slice(2, 4,)}`;
  const compressedPath = `compressed/${subDir}/${assetId}_${variant}.webp`;
  const fullPath = getAssetFilePath(uploadDir, compressedPath,);

  // Fall back to raw if no compressed variant
  if (!existsSync(fullPath,)) {
    return serveFile(getAssetFilePath(uploadDir, resolved.asset.storage_path,), resolved.asset.mime_type,);
  }
  return serveFile(fullPath, "image/webp",);
}

export async function handleDownload({
  database,
  assetId,
  uploadDir,
  actorId,
  actorRole,
  chatId,
  signedUrlSecret,
  signedUrlToken,
  signedUrlExpires,
  signedUrlAction,
}: ServeRawOpts & { chatId?: string },): Promise<Response> {
  const resolved = await resolveForServe({
    database,
    assetId,
    uploadDir,
    actorId,
    actorRole,
    signedUrlSecret,
    signedUrlToken,
    signedUrlExpires,
    signedUrlAction,
  },);
  if ("response" in resolved) { return resolved.response; }
  const { asset, } = resolved;
  const safeName = asset.filename.replaceAll(/[^\w.-]+/g, "_",);

  // If asset is encrypted, try to decrypt
  if (asset.encryption_tier !== "public" && asset.encrypted_key_id) {
    try {
      const smk = getSmk();
      if (!smk || !chatId) {
        return new Response("Encrypted asset requires chat context", { status: 400, },);
      }

      const chatKey = await deriveChatKeyForChat(database, chatId, smk,);
      const decryptedData = await getAssetData(database, assetId, uploadDir, chatKey,);

      if (!decryptedData) {
        return notFoundResponse("Failed to decrypt asset",);
      }

      return new Response(new Uint8Array(decryptedData,), {
        headers: {
          "Content-Type": asset.mime_type,
          "Content-Disposition": `attachment; filename="${safeName}"`,
        },
      },);
    } catch {
      return new Response("Failed to decrypt asset", { status: 500, },);
    }
  }

  return serveFile(getAssetFilePath(uploadDir, asset.storage_path,), asset.mime_type, {
    extraHeaders: { "Content-Disposition": `attachment; filename="${safeName}"`, },
  },);
}

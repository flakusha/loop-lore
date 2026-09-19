// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Serve handlers for raw bytes and the download endpoint — both share the
 * same chat-encrypted-asset decryption branch and serve the original file
 * (the /thumb variant lives in serve-handlers.ts since it differs in the
 * variant-path lookup).
 *
 * Extracted from serve-handlers.ts to keep that file under the per-module
 * size-strict gate (345 lines).
 */
import { IMMUTABLE_CACHE_MAX_AGE, } from "../config/constants";
import { deriveChatKeyForChat, getSmk, } from "../crypto";
import { notFoundResponse, } from "../routes/http-utils";
import { serveFile, } from "./serve-file";
import { resolveForServe, type ServeRawOpts, } from "./serve-handlers";
import { getAssetData, getAssetFilePath, } from "./service";

/**
 * Serve the original file (raw bytes, decrypting chat-encrypted assets).
 * @param root0
 * @param root0.database
 * @param root0.assetId
 * @param root0.uploadDir
 * @param root0.actorId
 * @param root0.actorRole
 * @param root0.chatId
 * @param root0.signedUrlSecret
 * @param root0.signedUrlToken
 * @param root0.signedUrlExpires
 * @param root0.signedUrlAction
 * @returns Raw asset bytes response.
 */
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
    actorId,
    actorRole,
    signedUrlSecret,
    signedUrlToken,
    signedUrlExpires,
    signedUrlAction,
  },);
  if (resolved instanceof Response) { return resolved; }

  const { asset, } = resolved;

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
          "Cache-Control": `public, max-age=${IMMUTABLE_CACHE_MAX_AGE}, immutable`,
          "X-Content-Type-Options": "nosniff",
        },
      },);
    } catch {
      return new Response("Failed to decrypt asset", { status: 500, },);
    }
  }

  return serveFile(getAssetFilePath(uploadDir, asset.storage_path,), asset.mime_type,);
}

/**
 * Serve the original file as an attachment download.
 * @param root0
 * @param root0.database
 * @param root0.assetId
 * @param root0.uploadDir
 * @param root0.actorId
 * @param root0.actorRole
 * @param root0.chatId
 * @param root0.signedUrlSecret
 * @param root0.signedUrlToken
 * @param root0.signedUrlExpires
 * @param root0.signedUrlAction
 * @returns Asset download response.
 */
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
    actorId,
    actorRole,
    signedUrlSecret,
    signedUrlToken,
    signedUrlExpires,
    signedUrlAction,
  },);
  if (resolved instanceof Response) { return resolved; }
  const { asset, } = resolved;
  const safeName = asset.filename.replaceAll(/[^\w.-]+/g, "_",);

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

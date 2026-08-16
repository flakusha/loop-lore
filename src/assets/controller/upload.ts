// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset Controller — upload handler
 */
import { deriveChatKeyForChat, getSmk, } from "../../crypto";
import type { ChatKey, } from "../../crypto/chat-keys";
import { badRequestResponse, HttpStatus, } from "../../routes/http-utils";
import { jsonStringifyOr, } from "../../utils";
import { safeFromUint8Array, } from "../../utils/safe-buffer";
import {
  createAsset,
  detectAssetType,
  validateFileSize,
  validateMimeType,
} from "../service";
import type { UploadOpts, } from "./types";

export async function handleUpload({
  request,
  userId,
  database,
  uploadDir,
  maxFileSize,
  chatId,
  config,
}: UploadOpts,): Promise<Response> {
  const contentType = request.headers.get("content-type",) ?? "";

  if (!contentType.includes("multipart/form-data",)) {
    return badRequestResponse("Expected multipart/form-data",);
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return badRequestResponse("Failed to parse multipart form data",);
  }

  const file = formData.get("file",);
  if (!file || !(file instanceof File)) {
    return badRequestResponse("file field is required",);
  }
  const bufferResult = safeFromUint8Array(Buffer.from(await file.arrayBuffer(),),);
  if (!bufferResult.ok) { return badRequestResponse(bufferResult.error.message,); }
  const buffer = bufferResult.buffer;
  const sizeError = validateFileSize(buffer.length, maxFileSize,);
  if (sizeError) { return badRequestResponse(sizeError,); }

  const mimeType = file.type || "application/octet-stream";
  const mimeError = validateMimeType(mimeType,);
  if (mimeError) { return badRequestResponse(mimeError,); }

  const altText = (formData.get("alt_text",) as string) ?? undefined;

  // Wire encryption context when chatId is provided
  let chatKey: ChatKey | null = null;
  const pipelineConfig = config?.encryption
    ? {
      threshold: config.encryption.compressThreshold,
      algorithm: config.encryption.compressAlgorithm,
    }
    : undefined;

  if (chatId && config?.encryption?.serverEncryptionKey) {
    const smk = getSmk();
    if (smk) {
      try {
        chatKey = await deriveChatKeyForChat(database, chatId, smk,);
      } catch {
        // Not in an encrypted chat — fall through to public storage
        chatKey = null;
      }
    }
  }

  const { asset, duplicate, } = await createAsset({
    database,
    input: {
      ownerId: userId,
      filename: file.name,
      mimeType,
      assetType: detectAssetType(mimeType,),
      sizeBytes: buffer.length,
      buffer,
      altText,
      encryptionTier: chatKey ? "standard" : "public",
      chatKey,
      keyId: chatKey?.keyId ?? null,
      pipelineConfig,
    },
    uploadDir,
  },);

  const body = {
    id: asset.id,
    filename: asset.filename,
    mime_type: asset.mime_type,
    asset_type: asset.asset_type,
    size_bytes: asset.size_bytes,
    storage_backend: asset.storage_backend,
    alt_text: asset.alt_text,
    ...(duplicate && { duplicate: true, }),
  };

  if (duplicate) {
    return Response.json(body, {
      status: HttpStatus.OK,
      headers: {
        "Content-Type": "application/json",
        "HX-Trigger": jsonStringifyOr({ "asset:duplicate": { id: asset.id, filename: asset.filename, }, },),
      },
    },);
  }
  return Response.json(body, {
    status: HttpStatus.Created,
    headers: {
      "Content-Type": "application/json",
      "HX-Trigger": jsonStringifyOr({ "asset:uploaded": null, },),
    },
  },);
}

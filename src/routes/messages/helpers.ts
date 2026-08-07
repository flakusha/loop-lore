import type { Kysely, } from "kysely";
import type { ServiceError, } from "../../chat/service";
import type { Config, } from "../../config/schema";
import { decodeContent, } from "../../content/decode";
import {
  decryptThenDecompress,
  deriveChatKeyForChat,
  getSmk,
} from "../../crypto";
import type { ContentEncoding, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getLogger, type Logger, } from "../../logger";
import { safeJsonParse, } from "../../utils";
import { ErrorCode, HttpStatus, jsonError, } from "../http-utils";

/** Logger bound to the messages module namespace. */
export function log(): Logger {
  return getLogger().child({ module: "messages", },);
}

/** Convert a ServiceError into an HTTP Response */
export function serviceErrorToResponse(error: ServiceError,): Response {
  switch (error.code) {
    case "forbidden": {
      return jsonError({
        message: error.message,
        status: HttpStatus.Forbidden,
        code: ErrorCode.Forbidden,
      },);
    }
    case "bad_request": {
      return jsonError({
        message: error.message,
        status: HttpStatus.BadRequest,
        code: ErrorCode.ValidationError,
      },);
    }
    case "not_found":
    default: {
      return jsonError({
        message: error.message,
        status: HttpStatus.NotFound,
        code: ErrorCode.NotFound,
      },);
    }
  }
}

/** Type guard: check if a value is a ServiceError (not a message record) */
export function isServiceError(
  value: Record<string, unknown> | ServiceError,
): value is ServiceError {
  return "code" in value && typeof (value as ServiceError).code === "string";
}

/** Resolve asset metadata for a message's stored attachment JSON payload. */
export async function enrichAttachments(
  database: Kysely<DB>,
  attachmentsJson: string | null,
): Promise<object | null> {
  if (!attachmentsJson) { return null; }
  const parsed = safeJsonParse<{
    assetId: string;
    order: number;
    caption: string;
    label: string;
  }[]>(attachmentsJson,);
  if (!parsed.ok) { return null; }
  const attachData = parsed.value;
  if (!Array.isArray(attachData,) || attachData.length === 0) { return null; }

  const assetIds = attachData.map((a,) => a.assetId);
  if (assetIds.length === 0) { return null; }

  const assets = await database
    .selectFrom("assets",)
    .select([
      "id",
      "filename",
      "mime_type",
      "asset_type",
      "size_bytes",
      "width",
      "height",
      "alt_text",
      "storage_path",
    ],)
    .where("id", "in", assetIds,)
    .execute();

  const assetMap = new Map(assets.map((a,) => [a.id, a,]),);

  return attachData.map((a,) => {
    const asset = assetMap.get(a.assetId,);
    return {
      assetId: a.assetId,
      order: a.order,
      caption: a.caption || (asset?.alt_text ?? ""),
      label: a.label,
      url: `/api/assets/${a.assetId}/raw`,
      thumbUrl: `/api/assets/${a.assetId}/thumb`,
      filename: asset?.filename ?? "",
      mimeType: asset?.mime_type ?? "",
      type: asset?.asset_type ?? "",
      sizeBytes: asset?.size_bytes ?? 0,
      width: asset?.width ?? 0,
      height: asset?.height ?? 0,
    };
  },);
}

/**
 * Resolve the plaintext content of a stored message, decrypting its payload
 * when it was stored encrypted (key_id set).
 */
export async function resolveMessageContent(
  database: Kysely<DB>,
  message: {
    content: string;
    content_encoding: string;
    key_id: string | null;
    chat_id: string;
  },
  _config: Config,
): Promise<string> {
  if (!message.key_id) {
    const enc = message.content_encoding as ContentEncoding;
    return enc === "identity" ? message.content : decodeContent(message.content, enc,);
  }

  const smk = getSmk();
  if (!smk) { throw new Error("Message is encrypted but no SMK loaded. Set SERVER_ENCRYPTION_KEY.",); }

  const chatKey = await deriveChatKeyForChat(database, message.chat_id, smk,);
  return decryptThenDecompress(message.content, chatKey.key,);
}

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { ServiceError, } from "../../chat/service";
import { decodeContent, } from "../../content/decode";
import {
  decryptAtRest,
  getChatEncryptionLevel,
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

  const assetIds = Array.from(attachData, (a,) => a.assetId,);
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

  const assetMap = new Map(Array.from(assets, (a,) => [a.id, a,],),);

  return Array.from(attachData, (a,) => {
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

/** A function call persisted on an assistant message (mirrors GenerationToolCall). */
export interface ToolCallRecord {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/** Parse a message's stored `tool_calls` JSON payload into a typed array (null when empty/invalid). */
export function parseToolCalls(toolCallsJson: string | null | undefined,): ToolCallRecord[] | null {
  if (!toolCallsJson) { return null; }
  const parsed = safeJsonParse<ToolCallRecord[]>(toolCallsJson,);
  if (!parsed.ok) { return null; }
  const calls = parsed.value;
  if (!Array.isArray(calls,) || calls.length === 0) { return null; }
  return calls;
}

/**
 * Resolve the plaintext content of a stored message.
 *
 * Handles three cases that prior call sites diverged on:
 *   1. encrypted payload (`key_id` set) → tier-aware decrypt via `decryptAtRest`
 *   2. gzip/brotli/zstd-stored plaintext (`key_id` null, encoding ≠ identity) →
 *      base64 + decompress via `decodeContent`
 *   3. identity plaintext → pass through
 *
 * Centralising this logic eliminates the three divergent inline copies that
 * previously leaked base64 gzip soup into chat history prompts and chat
 * exports whenever a message row crossed the 10KB compress threshold.
 */
export async function resolveMessageContent(
  database: Kysely<DB>,
  message: {
    content: string;
    content_encoding: string;
    key_id: string | null;
    chat_id: string;
  },
): Promise<string> {
  if (!message.key_id) {
    const enc = message.content_encoding as ContentEncoding;
    return enc === "identity" ? message.content : decodeContent(message.content, enc,);
  }

  const encryptionLevel = await getChatEncryptionLevel(database, message.chat_id,);
  return decryptAtRest({
    database,
    chatId: message.chat_id,
    storedContent: message.content,
    encryptionLevel,
  },);
}

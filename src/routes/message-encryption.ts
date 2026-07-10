/**
 * Message Encryption Route
 *
 * GET /api/chats/:chatId/encryption-key
 *   Returns the derived chat encryption key as base64 raw key material.
 *   Used by the frontend to encrypt messages client-side before sending.
 */

import type { RouteDispatch } from "./router";
import { registerRoute } from "./router";
import { jsonResponse, jsonError, HttpStatus } from "./http-utils";
import { deriveChatKeyForChat, getSmk, isEncryptionEnabled } from "../crypto";
import { getLogger, type Logger } from "../logger";

function log(): Logger {
  return getLogger().child({ module: "routes:message-encryption" });
}

const ENCRYPTION_KEY_RE = /^\/api\/chats\/([^/]+)\/encryption-key$/;
interface ParsedPath {
  chatId: string;
}

function parsePath(path: string): ParsedPath | null {
  const match = ENCRYPTION_KEY_RE.exec(path);
  if (!match) return null;
  return { chatId: match[1] };
}

const dispatch: RouteDispatch = async ({ request, database }) => {
  if (request.method !== "GET") return null;

  const parsed = parsePath(new URL(request.url).pathname);
  if (!parsed) return null;

  const { chatId } = parsed;

  if (!isEncryptionEnabled()) {
    return jsonError({ message: "Encryption not enabled on this server", status: HttpStatus.NotImplemented });
  }

  const smk = getSmk();
  if (!smk) {
    return jsonError({ message: "Encryption not configured", status: HttpStatus.InternalServerError });
  }

  try {
    const chatKey = await deriveChatKeyForChat(database, chatId, smk);
    const rawB64 = Buffer.from(chatKey.rawKey).toString("base64");

    return jsonResponse({
      keyId: chatKey.keyId,
      rawKey: rawB64,
      algorithm: "AES-GCM",
      length: 256,
    });
  } catch (error) {
    log().error(`Failed to derive chat key for ${chatId}: ${String(error)}`);
    return jsonError({ message: "Failed to get encryption key", status: HttpStatus.InternalServerError });
  }
};

registerRoute(dispatch);

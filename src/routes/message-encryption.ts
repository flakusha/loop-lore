/**
 * Message Encryption Route
 *
 * GET /api/chats/:id/encryption-key
 *   Returns the derived chat encryption key as base64 raw key material.
 *   Used by the frontend to encrypt messages client-side before sending.
 */
import { Elysia } from "elysia";
import type { Db } from "../db";
import type { Config } from "../config/schema";
import { jsonResponse, jsonError, HttpStatus } from "./http-utils";
import { deriveChatKeyForChat, getSmk, isEncryptionEnabled } from "../crypto";
import { getLogger, type Logger } from "../logger";

function log(): Logger {
  return getLogger().child({ module: "routes:message-encryption" });
}

export function messageEncryptionRoutes(opts: { database: Db; config: Config }): Elysia {
  return new Elysia().get("/api/chats/:id/encryption-key", async ({ params }) => {
    const chatId = params.id;

    if (!isEncryptionEnabled()) {
      return jsonError({
        message: "Encryption not enabled on this server",
        status: HttpStatus.NotImplemented,
      });
    }

    const smk = getSmk();
    if (!smk) {
      return jsonError({
        message: "Encryption not configured",
        status: HttpStatus.InternalServerError,
      });
    }

    try {
      const chatKey = await deriveChatKeyForChat(opts.database, chatId, smk);
      const rawB64 = Buffer.from(chatKey.rawKey).toString("base64");

      return jsonResponse({
        keyId: chatKey.keyId,
        rawKey: rawB64,
        algorithm: "AES-GCM",
        length: 256,
      });
    } catch (error) {
      log().error(`Failed to derive chat key for ${chatId}: ${String(error)}`);
      return jsonError({
        message: "Failed to get encryption key",
        status: HttpStatus.InternalServerError,
      });
    }
  }) as unknown as Elysia;
}

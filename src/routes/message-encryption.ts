/**
 * Message Encryption Routes
 *
 * GET /api/chats/:id/encryption-key
 *   Returns the derived chat encryption key as base64 raw key material.
 *   Used by the frontend to encrypt messages client-side before sending.
 *
 * GET /api/encryption/status
 *   Returns encryption and anonymous mode status.
 */
import { Elysia, } from "elysia";
import type { Config, } from "../config/schema";
import {
  deriveChatKeyForChat,
  getSmk,
  isAnonymousModeEnabled,
  isEncryptionEnabled,
} from "../crypto";
import type { Db, } from "../db";
import { getLogger, type Logger, } from "../logger";
import { HttpStatus, jsonError, jsonResponse, } from "./http-utils";

function log(): Logger {
  return getLogger().child({ module: "routes:message-encryption", },);
}

export function messageEncryptionRoutes(opts: { database: Db; config: Config },): Elysia {
  return new Elysia()
    .get("/api/chats/:id/encryption-key", async ({ params, ...rest },) => {
      const chatId = params.id;

      if (!isEncryptionEnabled()) {
        return jsonError({
          message: (rest as any).t?.("crypto.encryptionNotEnabled",) ?? "Encryption not enabled on this server",
          status: HttpStatus.NotImplemented,
        },);
      }

      const smk = getSmk();
      if (!smk) {
        return jsonError({
          message: (rest as any).t?.("crypto.encryptionNotConfigured",) ?? "Encryption not configured",
          status: HttpStatus.InternalServerError,
        },);
      }

      try {
        const chatKey = await deriveChatKeyForChat(opts.database, chatId, smk,);
        const rawB64 = Buffer.from(chatKey.rawKey,).toString("base64",);

        return jsonResponse({
          keyId: chatKey.keyId,
          rawKey: rawB64,
          algorithm: "AES-GCM",
          length: 256,
        },);
      } catch (error) {
        log().error(`Failed to derive chat key for ${chatId}: ${String(error,)}`,);
        return jsonError({
          message: (rest as any).t?.("crypto.encryptionKeyNotFound",) ?? "Failed to get encryption key",
          status: HttpStatus.InternalServerError,
        },);
      }
    },)
    .get("/api/encryption/status", async () => {
      return jsonResponse({
        encryptionEnabled: isEncryptionEnabled(),
        anonymousMode: isAnonymousModeEnabled(),
      },);
    },) as unknown as Elysia;
}

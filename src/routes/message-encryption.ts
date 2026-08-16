// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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
import { checkChatAccess, } from "../chat/service";
import type { Config, } from "../config/schema";
import {
  deriveChatKeyForChat,
  getSmk,
  isAnonymousModeEnabled,
  isEncryptionEnabled,
} from "../crypto";
import type { Db, } from "../db";
import { getLogger, type Logger, } from "../logger";
import { notFound, } from "../validation/middleware";
import { SuccessResponse, } from "../validation/schemas";
import { extractAuth, HttpStatus, jsonError, jsonResponse, requireUserId, } from "./http-utils";

function log(): Logger {
  return getLogger().child({ module: "routes:message-encryption", },);
}

export function messageEncryptionRoutes(opts: { database: Db; config: Config }, prefix = "/api",): Elysia {
  return new Elysia()
    .get(`${prefix}/chats/:id/encryption-key`, async (req,) => {
      const userId = requireUserId(req,);
      if (typeof userId !== "string") { return userId; }
      const { userRole, } = extractAuth(req,);
      const { params, ...rest } = req as unknown as { params: { id: string } };
      const chatId = params.id;

      const access = await checkChatAccess(opts.database, chatId, userId, userRole,);
      if (!access.ok) { return notFound("Chat not found",); }

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
    }, {
      response: {
        200: SuccessResponse,
      },
      detail: {
        summary: "Get chat encryption key",
        description:
          "Derive and return the encryption key for a specific chat, used for client-side message encryption.",
        tags: ["Messages", "Encryption",],
      },
    },)
    .get(`${prefix}/encryption/status`, () => {
      return jsonResponse({
        encryptionEnabled: isEncryptionEnabled(),
        anonymousMode: isAnonymousModeEnabled(),
      },);
    }, {
      response: {
        200: SuccessResponse,
      },
      detail: {
        summary: "Get encryption status",
        description: "Check whether encryption and anonymous mode are enabled on the server.",
        tags: ["Messages", "Encryption",],
      },
    },);
}

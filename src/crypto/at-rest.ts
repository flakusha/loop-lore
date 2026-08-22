// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * At-Rest Encryption — Tier-Aware Storage Layer
 *
 * Wraps the compress-then-encrypt pipeline with encryption-tier awareness.
 * Reads the chat's `encryption_level` to decide whether to encrypt/decrypt.
 *
 * Tiers:
 *   - `none`     — plaintext, no crypto
 *   - `standard` — server-mediated AES-256-GCM via chat keys (existing pipeline)
 *   - `private`  — end-to-end (delegated to e2e module, not yet wired)
 *
 * Note: `public` is NOT a valid tier value. The historical "public" sentinel was
 * removed by the 009_encryption_level_default migration.
 */

import type { Kysely, } from "kysely";
import type { EncryptionLevel, } from "../db/enums";
import type { DB, } from "../db/schema";
import { deriveChatKeyForChat, getChatKeyById, } from "./chat-keys";
import {
  compressThenEncrypt,
  decryptThenDecompress,
  extractKeyIdFromPayload,
  isEncryptedPayload,
} from "./pipeline";
import type { PipelineConfig, } from "./pipeline";
import { getSmk, isEncryptionEnabled, } from "./smk";

export interface AtRestEncryptOpts {
  database: Kysely<DB>;
  chatId: string;
  plaintext: string;
  encryptionLevel: EncryptionLevel;
  config?: PipelineConfig;
}

export interface AtRestDecryptOpts {
  database: Kysely<DB>;
  chatId: string;
  storedContent: string;
  encryptionLevel: EncryptionLevel;
}

export interface AtRestResult {
  storedContent: string;
  keyId: string | null;
  wasEncrypted: boolean;
}

export async function encryptAtRest(opts: AtRestEncryptOpts,): Promise<AtRestResult> {
  const { database, chatId, plaintext, encryptionLevel, config, } = opts;
  if (isEncryptedPayload(plaintext,)) {
    return { storedContent: plaintext, keyId: extractKeyIdFromPayload(plaintext,), wasEncrypted: true, };
  }
  switch (encryptionLevel) {
    case "none":
      return { storedContent: plaintext, keyId: null, wasEncrypted: false, };
    case "standard": {
      if (!isEncryptionEnabled()) { return { storedContent: plaintext, keyId: null, wasEncrypted: false, }; }
      const smk = getSmk();
      if (!smk) { throw new Error("standard tier requires SMK — set SERVER_ENCRYPTION_KEY",); }
      const chatKey = await deriveChatKeyForChat(database, chatId, smk,);
      const stored = await compressThenEncrypt({ plaintext, chatKey: chatKey.key, keyId: chatKey.keyId, config, },);
      return { storedContent: stored, keyId: chatKey.keyId, wasEncrypted: true, };
    }
    case "private":
      throw new Error(
        "private tier requires client-side E2E encryption. Pre-encrypt content before sending to the server.",
      );
    default:
      throw new Error(`Unknown encryption level: ${String(encryptionLevel,)}`,);
  }
}

export async function decryptAtRest(opts: AtRestDecryptOpts,): Promise<string> {
  const { database, storedContent, encryptionLevel, } = opts;
  switch (encryptionLevel) {
    case "none":
      return storedContent;
    case "standard": {
      if (!isEncryptedPayload(storedContent,)) { return storedContent; }
      if (!isEncryptionEnabled()) {
        throw new Error("Content is encrypted but encryption is not enabled on this server",);
      }
      const smk = getSmk();
      if (!smk) { throw new Error("standard tier requires SMK — set SERVER_ENCRYPTION_KEY",); }
      const keyId = extractKeyIdFromPayload(storedContent,);
      if (!keyId) { return storedContent; }
      const chatKey = await getChatKeyById(database, keyId, smk,);
      if (!chatKey) { throw new Error(`Chat key not found for id ${keyId} — rotation may have failed`,); }
      return decryptThenDecompress(storedContent, chatKey.key,);
    }
    case "private":
      throw new Error(
        "private tier requires client-side E2E decryption. Decrypt content on the client using the chat's private key.",
      );
    default:
      throw new Error(`Unknown encryption level: ${String(encryptionLevel,)}`,);
  }
}

export function needsEncryption(encryptionLevel: EncryptionLevel, storedContent: string,): boolean {
  if (encryptionLevel === "none") { return false; }
  if (isEncryptedPayload(storedContent,)) { return false; }
  return encryptionLevel === "standard" || encryptionLevel === "private";
}

export async function getChatEncryptionLevel(database: Kysely<DB>, chatId: string,): Promise<EncryptionLevel> {
  const row = await database
    .selectFrom("chats",)
    .select("encryption_level",)
    .where("id", "=", chatId,)
    .executeTakeFirst();
  return (row?.encryption_level as EncryptionLevel) ?? "none";
}

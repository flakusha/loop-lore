// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * At-Rest Encryption — Tier-Aware Storage Layer
 *
 * Wraps the compress-then-encrypt pipeline with encryption-tier awareness.
 * Reads the chat's `encryption_level` to decide whether to encrypt/decrypt.
 *
 * Tiers:
 *   - `none`      — plaintext, no crypto
 *   - `standard`  — server-mediated AES-256-GCM via chat keys
 *   - `at-rest`   — end-to-end; server cannot decrypt. The client supplies
 *                   a pre-encrypted `e2e_payload` JSON blob; we store it
 *                   as-is and return it on read.
 *
 * Note: `public` is NOT a valid tier value. The historical "public" sentinel
 * was removed by the 009_encryption_level_default migration.
 *
 * Migration note (TASK-asymmetric-key-pairs-followup Phase D):
 *   - The historical value `"private"` was renamed to `"at-rest"` by the
 *     `057_encryption_level_at_rest_rename` migration. The runtime symbol
 *     `EncryptionLevel.AtRest` replaces `EncryptionLevel.Private`.
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
    case "at-rest":
      // Server cannot decrypt `at-rest` content. The caller is expected to
      // have pre-encrypted via the client-side pipeline (`encrypt-message`).
      // The server stores whatever the client sent, unchanged. The shape
      // detection (`isEncryptedPayload` above) recognises standard server-
      // encrypted forms; for `at-rest` we accept any input.
      return { storedContent: plaintext, keyId: null, wasEncrypted: true, };
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
    case "at-rest":
      // Server has no chain state; cannot decrypt. The HTTP read path
      // passes the ciphertext blob back to the client verbatim; the client
      // decrypts using its local key store.
      return storedContent;
    default:
      throw new Error(`Unknown encryption level: ${String(encryptionLevel,)}`,);
  }
}

export function needsEncryption(encryptionLevel: EncryptionLevel, storedContent: string,): boolean {
  if (encryptionLevel === "none") { return false; }
  if (isEncryptedPayload(storedContent,)) { return false; }
  return encryptionLevel === "standard" || encryptionLevel === "at-rest";
}

export async function getChatEncryptionLevel(database: Kysely<DB>, chatId: string,): Promise<EncryptionLevel> {
  const row = await database
    .selectFrom("chats",)
    .select("encryption_level",)
    .where("id", "=", chatId,)
    .executeTakeFirst();
  return (row?.encryption_level as EncryptionLevel) ?? "none";
}

/**
 * Inspect a stored message body to decide whether it carries ciphertext
 * (either a standard server-encrypted `{enc,nonce,...}` shape, or an
 * `at-rest` `{e2e:true,...}` envelope). The `at-rest` flow uses this
 * helper to short-circuit decryption at the chat list / read layer.
 *
 * Returns true when the body is a JSON-encoded object containing either
 * `e2e: true` (E2E at-rest envelope) or a string `enc` field
 * (server-encrypted payload).
 */
export function isE2eOrEncrypted(storedContent: string,): boolean {
  if (!storedContent) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(storedContent,);
  } catch {
    return false;
  }
  if (typeof parsed !== "object" || parsed === null) return false;
  const obj = parsed as Record<string, unknown>;
  if (obj["e2e"] === true) return true;
  if (typeof obj["enc"] === "string") return true;
  return false;
}

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
 *   - `at-rest`   — wire-passthrough (Phase D plumbing). The server stores
 *                   whatever the caller hands in and returns it on read.
 *                   It does NOT attempt server-side encrypt, decrypt, or
 *                   transform. The caller is responsible for pre-encrypting
 *                   when true client-side E2E is desired. NOTE: the server
 *                   still holds SMK-derived chat keys, so any caller that
 *                   submits plaintext will land in the DB as plaintext.
 *                   True client-side E2E (server cannot decrypt) is tracked
 *                   in TASK-asymmetric-key-pairs-followup Phase E+.
 *
 * Note: `public` is NOT a valid tier value. The historical "public" sentinel
 * was removed by the 009_encryption_level_default migration.
 *
 * Migration note:
 *   - The historical value `"private"` was renamed to `"at-rest"` by the
 *     `057_encryption_level_at_rest_rename` migration. The runtime
 *     `AtRest` symbol replaces the removed `Private` symbol (no
 *     deprecated alias — clean cutover).
 */

import type { Kysely, } from "kysely";
import type { EncryptionLevel, } from "../db/enums";
import type { DB, } from "../db/schema";
import { safeJsonParse, } from "../utils";
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
      // Wire passthrough. The server does not transform the payload —
      // encryption responsibility sits with the caller (client-side E2E
      // pipeline once TASK-asymmetric-key-pairs-followup Phase E lands,
      // or whatever upstream pre-encrypts the message). The pre-check
      // at the top of this function (`isEncryptedPayload`) recognises
      // standard server-encrypted envelopes; for `at-rest` we accept
      // any input and store it as-is. `wasEncrypted: true` reflects
      // "stored verbatim, not transformed by the server" rather than
      // "encrypted by this call".
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
      // Wire passthrough. The server does not attempt to decrypt: it
      // returns the stored content verbatim so the upstream reader (the
      // HTTP route, or a future client-side E2E receive path) can do the
      // right thing with it. Plaintext will round-trip as plaintext.
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
 * `at-rest` `{e2e:true,...}` envelope). The HTTP read path uses this
 * helper to short-circuit decryption at the chat list / read layer.
 *
 * Returns true when the body is a JSON-encoded object containing either
 * `e2e: true` (client-pre-encrypted envelope — server does not decrypt,
 * future Phase E+) or a string `enc` field (server-encrypted payload).
 */
export function isE2eOrEncrypted(storedContent: string,): boolean {
  if (!storedContent) { return false; }
  const parsed = safeJsonParse(storedContent,);
  if (!parsed.ok) { return false; }
  const obj = parsed.value as Record<string, unknown>;
  if (typeof obj !== "object" || obj === null) { return false; }
  if (obj["e2e"] === true) { return true; }
  if (typeof obj["enc"] === "string") { return true; }
  return false;
}

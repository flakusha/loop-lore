// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * At-Rest Encryption — Tier-Aware Storage Layer
 *
 * Wraps the compress-then-encrypt pipeline with encryption-tier awareness.
 * Reads the chat's `encryption_level` to decide whether to encrypt/decrypt.
 *
 * Tiers:
 *   - `public`   — plaintext, no crypto
 *   - `standard` — server-mediated AES-256-GCM via chat keys (existing pipeline)
 *   - `private`  — end-to-end (delegated to e2e module, not yet wired)
 */

import type { Kysely, } from "kysely";
import type { EncryptionLevel, } from "../db/enums";
import type { DB, } from "../db/schema";
import { deriveChatKeyForChat, } from "./chat-keys";
import {
  compressThenEncrypt,
  decryptThenDecompress,
  extractKeyIdFromPayload,
  isEncryptedPayload,
} from "./pipeline";
import type { PipelineConfig, } from "./pipeline";
import { getSmk, isEncryptionEnabled, } from "./smk";

// ── Types ──────────────────────────────────────────────────

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

// ── Encrypt ────────────────────────────────────────────────

/**
 * Encrypt content based on the chat's encryption tier.
 *
 * - `public`: stores plaintext as-is (no encryption).
 * - `standard`: compress-then-encrypt via chat key.
 * - `private`: throws (E2E not yet wired — clients must pre-encrypt).
 */
export async function encryptAtRest(opts: AtRestEncryptOpts,): Promise<AtRestResult> {
  const { database, chatId, plaintext, encryptionLevel, config, } = opts;

  // If client already pre-encrypted, store as-is regardless of tier
  if (isEncryptedPayload(plaintext,)) {
    return {
      storedContent: plaintext,
      keyId: extractKeyIdFromPayload(plaintext,),
      wasEncrypted: true,
    };
  }

  switch (encryptionLevel) {
"43: @theirs\n44: @theirs"
  }
}

// ── Decrypt ────────────────────────────────────────────────

/**
 * Decrypt content based on the chat's encryption tier.
 *
 * - `public`: returns content as-is.
 * - `standard`: decrypt-then-decompress via chat key.
 * - `private`: throws (E2E not yet wired — clients must decrypt locally).
 */
export async function decryptAtRest(opts: AtRestDecryptOpts,): Promise<string> {
  const { database, chatId, storedContent, encryptionLevel, } = opts;

  switch (encryptionLevel) {
"43: @theirs\n44: @theirs"
  }
}

// ── Helpers ────────────────────────────────────────────────

/**
 * Check if content needs encryption for the given tier.
 */
export function needsEncryption(encryptionLevel: EncryptionLevel, storedContent: string,): boolean {
  if (encryptionLevel === "none") { return false; }
  if (isEncryptedPayload(storedContent,)) { return false; // already encrypted
   }
  return encryptionLevel === "standard" || encryptionLevel === "private";
}

/**
 * Get the encryption level for a chat (read from DB).
 */
export async function getChatEncryptionLevel(
  database: Kysely<DB>,
  chatId: string,
): Promise<EncryptionLevel> {
  const row = await database
    .selectFrom("chats",)
    .select("encryption_level",)
    .where("id", "=", chatId,)
    .executeTakeFirst();
  return (row?.encryption_level as EncryptionLevel) ?? "none";
}

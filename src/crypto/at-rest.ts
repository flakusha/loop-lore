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
    case "public":
      return { storedContent: plaintext, keyId: null, wasEncrypted: false, };

    case "standard": {
      if (!isEncryptionEnabled()) {
        return { storedContent: plaintext, keyId: null, wasEncrypted: false, };
      }
      const smk = getSmk();
      if (!smk) { throw new Error("standard tier requires SMK — set SERVER_ENCRYPTION_KEY",); }
      const chatKey = await deriveChatKeyForChat(database, chatId, smk,);
      const stored = await compressThenEncrypt({
        plaintext,
        chatKey: chatKey.key,
        keyId: chatKey.keyId,
        config,
      },);
      return { storedContent: stored, keyId: chatKey.keyId, wasEncrypted: true, };
    }

    case "private":
      // E2E: clients must pre-encrypt before sending. Server cannot encrypt.
      throw new Error(
        "private tier requires client-side E2E encryption. " +
          "Pre-encrypt content before sending to the server.",
      );

    default:
      throw new Error(`Unknown encryption level: ${String(encryptionLevel,)}`,);
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
    case "public":
      return storedContent;

    case "standard": {
      if (!isEncryptedPayload(storedContent,)) {
        // Legacy plaintext in standard-tier chat — return as-is
        return storedContent;
      }
      if (!isEncryptionEnabled()) {
        throw new Error("Content is encrypted but encryption is not enabled on this server",);
      }
      const smk = getSmk();
      if (!smk) { throw new Error("standard tier requires SMK — set SERVER_ENCRYPTION_KEY",); }
      const chatKey = await deriveChatKeyForChat(database, chatId, smk,);
      return decryptThenDecompress(storedContent, chatKey.key,);
    }

    case "private":
      // E2E: clients must decrypt locally. Server cannot decrypt.
      throw new Error(
        "private tier requires client-side E2E decryption. " +
          "Decrypt content on the client using the chat's private key.",
      );

    default:
      throw new Error(`Unknown encryption level: ${String(encryptionLevel,)}`,);
  }
}

// ── Helpers ────────────────────────────────────────────────

/**
 * Check if content needs encryption for the given tier.
 */
export function needsEncryption(encryptionLevel: EncryptionLevel, storedContent: string,): boolean {
  if (encryptionLevel === "public") { return false; }
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
  return (row?.encryption_level as EncryptionLevel) ?? "public";
}

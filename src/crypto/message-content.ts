// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared encryption helpers for message `content` read/write.
 *
 * These centralize the encryption/decryption of `messages.content` so every
 * read path (prompt assembly, exports, context/token counting, message list)
 * and every write path (auto-gen, generate-route, game-master narration) uses
 * the tier-aware at-rest layer.
 *
 * Invariant: a message row is encrypted **iff** its `key_id` is set. Unencrypted
 * rows carry an opaque `content_encoding` (usually `identity`, or `gzip` for
 * large plaintext payloads) and must never be fed to the decrypt pipeline.
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { ensureActorKey, } from "./actor-keys";
import { decryptAtRest, encryptAtRest, getChatEncryptionLevel, } from "./at-rest";
/** The parts of a message row the encryption helpers need. */
export interface MessageContentRef {
  content: string;
  content_encoding: string;
  key_id: string | null;
  chat_id: string;
}

/** */
export interface EncryptMessageOpts {
  database: Kysely<DB>;
  chatId: string;
  actorId: string;
  plaintext: string;
  smk: CryptoKey;
  pipeline?: { threshold?: number; algorithm?: "gzip" | "brotli" | "zstd" };
}

/** */
export interface EncryptMessageResult {
  storedContent: string;
  keyId: string | null;
}

/**
 * Encrypt (and compress) a plaintext message body for a chat.
 *
 * The chat's encryption tier is read from the database via
 * `getChatEncryptionLevel`. This function delegates entirely to `encryptAtRest`,
 * which handles tier-aware encryption (none → plaintext, standard → AES-256-GCM,
 * private → throws with guidance to pre-encrypt client-side).
 * @param root0
 * @param root0.database
 * @param root0.chatId
 * @param root0.actorId
 * @param root0.plaintext
 * @param root0.smk
 * @param root0.pipeline
 */
export async function encryptMessageContent({
  database,
  chatId,
  actorId,
  plaintext,
  smk,
  pipeline,
}: EncryptMessageOpts,): Promise<EncryptMessageResult> {
  // ensureActorKey is required before deriveChatKeyForChat in the standard path —
  // without it the actor_keys row is missing and per-chat derivation crashes.
  await ensureActorKey({ database, actorId, smk, },);
  const encryptionLevel = await getChatEncryptionLevel(database, chatId,);
  const result = await encryptAtRest({
    database,
    chatId,
    plaintext,
    encryptionLevel,
    config: {
      threshold: pipeline?.threshold ?? 128,
      algorithm: (pipeline?.algorithm ?? "gzip") as "gzip" | "brotli" | "zstd",
    },
  },);
  return { storedContent: result.storedContent, keyId: result.keyId, };
}

/**
 * Read a message's content to plaintext, decrypting based on the chat's tier.
 *
 * The chat's encryption tier is read from the database. This function delegates
 * entirely to `decryptAtRest`, which handles tier-aware decryption
 * (none → identity/decode, standard → decrypt-then-decompress, private → throws).
 * @param database
 * @param message
 * @param _smk
 * @throws If decryption fails (tampered / wrong key) or if no SMK is available
 *         for a standard-tier chat.
 */
export async function decryptMessageContent(
  database: Kysely<DB>,
  message: MessageContentRef,
  _smk: CryptoKey,
): Promise<string> {
  const encryptionLevel = await getChatEncryptionLevel(database, message.chat_id,);
  return decryptAtRest({
    database,
    chatId: message.chat_id,
    storedContent: message.content,
    encryptionLevel,
  },);
}

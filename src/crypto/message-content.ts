/**
 * Shared encryption helpers for message `content` read/write.
 *
 * These centralize the encryption/decryption of `messages.content` so every
 * read path (prompt assembly, exports, context/token counting, message list)
 * and every write path (auto-gen, generate-route, game-master narration) uses
 * the same rules as the canonical inline implementation in `routes/messages.ts`.
 *
 * Invariant: a message row is encrypted **iff** its `key_id` is set. Unencrypted
 * rows carry an opaque `content_encoding` (usually `identity`, or `gzip` for
 * large plaintext payloads) and must never be fed to the decrypt pipeline.
 */

import type { Kysely, } from "kysely";
import { decodeContent, } from "../content/decode";
import type { ContentEncoding, } from "../db/enums";
import type { DB, } from "../db/schema";
import { ensureActorKey, } from "./actor-keys";
import { deriveChatKeyForChat, } from "./chat-keys";
import {
  compressThenEncrypt,
  decryptThenDecompress,
  type PipelineConfig,
} from "./pipeline";

/** The parts of a message row the encryption helpers need. */
export interface MessageContentRef {
  content: string;
  content_encoding: string;
  key_id: string | null;
  chat_id: string;
}

export interface EncryptMessageOpts {
  database: Kysely<DB>;
  chatId: string;
  actorId: string;
  plaintext: string;
  smk: CryptoKey;
  pipeline?: PipelineConfig;
}

export interface EncryptMessageResult {
  storedContent: string;
  keyId: string | null;
}

/**
 * Encrypt (and compress) a plaintext message body for a chat, ensuring the
 * actor key exists first (a prerequisite for per-chat key derivation).
 *
 * Always returns a `{storedContent, keyId}` pair; the caller decides whether
 * encryption is enabled. When the caller does not want encryption, ignore the
 * result and store plaintext with `content_encoding = identity`.
 */
export async function encryptMessageContent({
  database,
  chatId,
  actorId,
  plaintext,
  smk,
  pipeline,
}: EncryptMessageOpts,): Promise<EncryptMessageResult> {
  // ensureActorKey is required before deriveChatKeyForChat — without it the
  // actor_key row is missing and per-chat derivation crashes in story/GM chats.
  await ensureActorKey({ database, actorId, smk, },);
  const chatKey = await deriveChatKeyForChat(database, chatId, smk,);
  const storedContent = await compressThenEncrypt({
    plaintext,
    chatKey: chatKey.key,
    keyId: chatKey.keyId,
    config: pipeline,
  },);
  return { storedContent, keyId: chatKey.keyId, };
}

/**
 * Read a message's content to plaintext, decrypting when the row is encrypted.
 *
 * @throws If the row is encrypted but decryption fails (tampered / wrong key),
 *         or if `key_id` is set but no SMK is loaded.
 */
export async function decryptMessageContent(
  database: Kysely<DB>,
  message: MessageContentRef,
  smk: CryptoKey,
): Promise<string> {
  if (!message.key_id) {
    const enc = message.content_encoding as ContentEncoding;
    return enc === "identity" ? message.content : decodeContent(message.content, enc,);
  }
  const chatKey = await deriveChatKeyForChat(database, message.chat_id, smk,);
  return decryptThenDecompress(message.content, chatKey.key,);
}

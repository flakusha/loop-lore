// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Re-encrypt recent chat messages after key rotation.
 *
 * - `reEncryptChatMessages` — derives the current chat key and uses it for
 *   both decrypt and encrypt. Use when no key change has happened (e.g. bulk
 *   refresh, schema migration).
 *
 * The internal `reEncryptWithKeys` is used by `rotateActorKeyAndReEncrypt`
 * which passes explicit old+new keys to correctly handle key rotation.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import type { ChatKey, } from "../chat-keys";
import { deriveChatKeyForChat, } from "../chat-keys";
import { compressThenEncrypt, decryptThenDecompress, } from "../pipeline";

/**
 * Internal: decrypt each message with `oldKey`, re-encrypt with `newKey`.
 * Messages that fail decryption are surfaced via the returned `failures` array
 * instead of silently swallowed.
 *
 * @returns `{ reEncrypted, failures }` where `failures[i]` is `{ id, reason }`.
 */
export async function reEncryptWithKeys(
  database: Kysely<DB>,
  chatId: string,
  oldKey: ChatKey,
  newKey: ChatKey,
  limit: number,
): Promise<{ reEncrypted: number; failures: { id: string; reason: string }[] }> {
  const messages = await database
    .selectFrom("messages",)
    .select(["id", "content", "key_id",],)
    .where("chat_id", "=", chatId,)
    .where("key_id", "is not", null,)
    .where("visibility", "=", "visible",)
    .orderBy("created_at", "desc",)
    .limit(limit,)
    .execute();

  let reEncrypted = 0;
  const failures: { id: string; reason: string }[] = [];

  for (const msg of messages) {
    if (!msg.key_id || !msg.content) {
      continue;
    }

    try {
      // Decrypt with the OLD key (the key that originally encrypted this row)
      const plaintext = await decryptThenDecompress(msg.content, oldKey.key,);

      // Re-encrypt with the NEW key and persist
      const newContent = await compressThenEncrypt({
        plaintext,
        chatKey: newKey.key,
        keyId: newKey.keyId,
      },);

      await database
        .updateTable("messages",)
        .set({
          content: newContent,
          key_id: newKey.keyId,
        },)
        .where("id", "=", msg.id,)
        .execute();

      reEncrypted++;
    } catch (error) {
      // Surface the failure — do not silently drop history.
      const reason = error instanceof Error ? error.message : String(error,);
      failures.push({ id: msg.id, reason, },);
    }
  }

  return { reEncrypted, failures, };
}

/**
 * Re-encrypt recent messages in a chat using the current chat key for both
 * decrypt and encrypt (no key change assumed).
 */
export async function reEncryptChatMessages(
  database: Kysely<DB>,
  chatId: string,
  smk: CryptoKey,
  limit: number,
): Promise<number> {
  const chatKey = await deriveChatKeyForChat(database, chatId, smk,);
  const { reEncrypted, } = await reEncryptWithKeys(database, chatId, chatKey, chatKey, limit,);
  return reEncrypted;
}

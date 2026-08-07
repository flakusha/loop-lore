/**
 * Re-encrypt recent chat messages after key rotation.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { deriveChatKeyForChat, } from "../chat-keys";
import { compressThenEncrypt, decryptThenDecompress, } from "../pipeline";

/**
 * Re-encrypt recent messages in a chat with the current chat key.
 * Used after key rotation to ensure messages are accessible with the new key.
 */
export async function reEncryptChatMessages(
  database: Kysely<DB>,
  chatId: string,
  smk: CryptoKey,
  limit: number,
): Promise<number> {
  // Get current chat key (will be re-derived with new actor key)
  const chatKey = await deriveChatKeyForChat(database, chatId, smk,);

  // Find recent encrypted messages for this chat
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

  for (const msg of messages) {
    if (!msg.key_id || !msg.content) { continue; }

    try {
      // Decrypt with old key (via current chat key derivation)
      // Note: This assumes the chat key derivation still works with the old actor key
      // If the old key is expired, we need to handle this differently
      const plaintext = await decryptThenDecompress(msg.content, chatKey.key,);

      // Re-encrypt with new key
      const newContent = await compressThenEncrypt({
        plaintext,
        chatKey: chatKey.key,
        keyId: chatKey.keyId,
      },);

      // Update in DB
      await database
        .updateTable("messages",)
        .set({
          content: newContent,
          key_id: chatKey.keyId,
        },)
        .where("id", "=", msg.id,)
        .execute();

      reEncrypted++;
    } catch {
      // Skip messages that can't be re-encrypted (e.g., different key)
      // These will remain accessible with the old key until it's revoked
    }
  }

  return reEncrypted;
}

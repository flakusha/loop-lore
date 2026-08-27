/**
 * Re-encrypt recent chat messages + asset blobs after key rotation.
 *
 * - `reEncryptChatMessages` — derives the current chat key and uses it for
 *   both decrypt and encrypt. Use when no key change has happened (e.g. bulk
 *   refresh, schema migration).
 * - `reEncryptChatAssets` — re-encrypts encrypted asset blobs in a chat.
 *   Each asset is encrypted with a per-asset HKDF subkey derived from the
 *   parent chat key + asset id. Subkey derivation is deterministic, so
 *   re-deriving from (newChatKey, assetId) produces the equivalent subkey.
 *   No per-asset key table is needed; the salt (assetId) is recoverable from
 *   the payload's `a_id` field (v2) or the caller (v1).
 *
 * The internal `reEncryptWithKeys` is used by `rotateKeyOnLeave` which passes
 * explicit old+new keys to correctly handle key rotation.
 */
import type { Kysely, } from "kysely";
import { readFileSync, writeFileSync, } from "node:fs";
import { getAssetFilePath, } from "../../assets/service/file-system";
import type { DB, } from "../../db/schema";
import { decryptAssetBlob, encryptAssetBlob, } from "../asset-encryption";
import type { ChatKey, } from "../chat-keys";
import { deriveChatKeyForChat, } from "../chat-keys";
import { compressThenEncrypt, decryptThenDecompress, } from "../pipeline";
import type { PipelineConfig, } from "../pipeline";

/**
 * Internal: decrypt each message with `oldKey`, re-encrypt with `newKey`.
 * Messages that fail decryption are surfaced via the returned `failures` array
 * instead of silently swallowed.
 *
 * Includes ALL messages (visible, hidden, archived, deleted) to prevent
 * stranded rows under expired keys.
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

export async function reEncryptChatAssets(
  database: Kysely<DB>,
  chatId: string,
  uploadDir: string,
  pipelineConfig: PipelineConfig,
  oldKey: ChatKey,
  newKey: ChatKey,
): Promise<{ reEncrypted: number; failures: { id: string; reason: string }[] }> {
  // Find encrypted assets linked to this chat
  const assets = await database
    .selectFrom("assets",)
    .innerJoin("asset_links", "asset_links.asset_id", "assets.id",)
    .select(["assets.id", "assets.storage_path", "assets.encrypted_key_id",],)
    .where("asset_links.entity_type", "=", "chat",)
    .where("asset_links.entity_id", "=", chatId,)
    .where("assets.encryption_tier", "<>", "public",)
    .where("assets.encrypted_key_id", "is not", null,)
    .execute();

  let reEncrypted = 0;
  const failures: { id: string; reason: string }[] = [];

  for (const asset of assets) {
    if (!asset.encrypted_key_id) { continue; }
    const filePath = getAssetFilePath(uploadDir, asset.storage_path,);
    let buffer: Buffer;
    try {
      buffer = readFileSync(filePath,);
    } catch (err) {
      failures.push({ id: asset.id, reason: `read failed: ${(err as Error).message}`, },);
      continue;
    }

    try {
      // Decrypt with the OLD key (the key that originally encrypted this blob)
      const plaintext = await decryptAssetBlob(buffer, oldKey, asset.id,);
      // Re-encrypt with the NEW key
      const result = await encryptAssetBlob(
        plaintext,
        newKey,
        asset.encrypted_key_id,
        asset.id,
        pipelineConfig,
        "at-rest",
      );
      if (result.encrypted) {
        writeFileSync(filePath, result.data,);
        reEncrypted++;
      }
    } catch (err) {
      failures.push({ id: asset.id, reason: (err as Error).message, },);
    }
  }

  return { reEncrypted, failures, };
}

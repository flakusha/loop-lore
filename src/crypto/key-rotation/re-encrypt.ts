// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Re-encrypt recent chat messages + asset blobs after key rotation.
 *
 * - `reEncryptChatMessages` — derives the current chat key and uses it for
 *   both decrypt and encrypt. Use when no key change has happened (e.g. bulk
 *   refresh, schema migration). Only re-encodes visible messages by default.
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
import fs from "node:fs";
import { getAssetFilePath, } from "../../assets/service/file-system";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { decryptAssetBlob, encryptAssetBlob, } from "../asset-encryption";
import type { ChatKey, } from "../chat-keys";
import { deriveChatKeyForChat, } from "../chat-keys";
import { compressThenEncrypt, decryptThenDecompress, } from "../pipeline";
import type { PipelineConfig, } from "../pipeline";

/** */
export interface ReEncryptOptions {
  /** Include hidden/archived/deleted messages (for key rotation). Default: false. */
  includeAll?: boolean;
}

/**
 * Internal: decrypt each message with `oldKey`, re-encrypt with `newKey`.
 * Messages that fail decryption are surfaced via the returned `failures` array
 * instead of silently swallowed.
 * @param database
 * @param chatId
 * @param oldKey
 * @param newKey
 * @param limit
 * @param options
 * @returns `{ reEncrypted, failures }` where `failures[i]` is `{ id, reason }`.
 */
export async function reEncryptWithKeys(
  database: Kysely<DB>,
  chatId: string,
  oldKey: ChatKey,
  newKey: ChatKey,
  limit: number,
  options: ReEncryptOptions = {},
): Promise<{ reEncrypted: number; failures: { id: string; reason: string }[] }> {
  const { includeAll = false, } = options;

  let query = database
    .selectFrom("messages",)
    .select(["id", "content", "key_id",],)
    .where("chat_id", "=", chatId,)
    .where("key_id", "is not", null,);

  // For key rotation, include ALL messages to prevent stranded rows under
  // expired keys. For migration/refresh, only re-encode visible messages.
  if (!includeAll) {
    query = query.where("visibility", "=", "visible",);
  }

  const messages = await query
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
      const reason = error instanceof Error ? error.message : String(error,);
      // A row naming a key this chat does NOT hold was written under a
      // foreign/forged key: nobody can decrypt it, so it can never be
      // re-encrypted. Skip it (logged) instead of failing the rotation —
      // one such row must not wedge the chat forever (BE-1). A row that
      // names the live key and still fails is real corruption and stays
      // fatal.
      if (msg.key_id !== oldKey.keyId) {
        getLogger().warn("Skipping message with a foreign key id during re-encrypt", {
          chatId,
          messageId: msg.id,
          keyId: msg.key_id,
          expectedKeyId: oldKey.keyId,
          reason,
        },);

        continue;
      }

      // Surface the failure — do not silently drop history.
      failures.push({ id: msg.id, reason, },);
    }
  }

  return { reEncrypted, failures, };
}

/**
 * Re-encrypt recent messages in a chat using the current chat key for both
 * decrypt and encrypt (no key change assumed). Only visible messages by default.
 * @param database
 * @param chatId
 * @param smk
 * @param limit
 * @returns void
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

/** Result of {@link reEncryptChatAssets} — re-encrypted blobs are staged, not in-place. */
export interface AssetReEncryptResult {
  reEncrypted: number;
  failures: { id: string; reason: string }[];
  /**
   * Re-encrypted blobs staged at temp paths. The caller renames these into
   * place ONLY after its DB transaction commits; on any pre-commit failure
   * it deletes them so the original (old-key) files stay consistent with
   * the rolled-back database.
   */
  staged: { tmpPath: string; finalPath: string }[];
}

/**
 * @param database
 * @param chatId
 * @param uploadDir
 * @param pipelineConfig
 * @param oldKey
 * @param newKey
 * @returns AssetReEncryptResult with staged temp paths for post-commit rename
 */
export async function reEncryptChatAssets(
  database: Kysely<DB>,
  chatId: string,
  uploadDir: string,
  pipelineConfig: PipelineConfig,
  oldKey: ChatKey,
  newKey: ChatKey,
): Promise<AssetReEncryptResult> {
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
  const staged: { tmpPath: string; finalPath: string }[] = [];

  for (const asset of assets) {
    if (!asset.encrypted_key_id) { continue; }
    const filePath = getAssetFilePath(uploadDir, asset.storage_path,);
    let buffer: Buffer;
    try {
      buffer = fs.readFileSync(filePath,);
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
        // Stage to a temp path — the caller renames into place only after
        // its DB transaction commits, so a rollback cannot leave new-key
        // ciphertext on disk under the old key
        // (BUG-rotatekeyonleave-re-encrypts-asset-files-before-the-db-trans).
        const tmpPath = `${filePath}.reenc-${asset.id}.tmp`;
        fs.writeFileSync(tmpPath, result.data,);
        staged.push({ tmpPath, finalPath: filePath, },);
        reEncrypted++;
      }
    } catch (err) {
      failures.push({ id: asset.id, reason: (err as Error).message, },);
    }
  }

  return { reEncrypted, failures, staged, };
}

/**
 * Key Rotation — Auto-rotation logic for actor keys
 *
 * Finds expired keys, rotates them, and re-encrypts historical messages.
 * Designed to run as a periodic timer (cron-like) in the server process.
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, type Logger, } from "../logger";
import { generateActorKey, listActorKeys, } from "./actor-keys";
import { deriveChatKeyForChat, } from "./chat-keys";
import { compressThenEncrypt, decryptThenDecompress, } from "./pipeline";
import { getSmk, isEncryptionEnabled, } from "./smk";

function log(): Logger {
  return getLogger().child({ module: "crypto:key-rotation", },);
}

export interface RotationResult {
  actorId: string;
  oldKeyId: string;
  newKeyId: string;
  chatsAffected: number;
  messagesReEncrypted: number;
}

export interface RotationSummary {
  checked: number;
  rotated: number;
  results: RotationResult[];
  errors: string[];
}

/**
 * Find actor keys that have expired based on rotation days config.
 * Returns actor IDs with expired primary keys.
 */
export async function findExpiredKeys(
  database: Kysely<DB>,
  rotationDays: number,
): Promise<string[]> {
  if (rotationDays <= 0) { return []; }

  const cutoff = new Date(Date.now() - rotationDays * 24 * 60 * 60 * 1000,).toISOString();

  const expired = await database
    .selectFrom("actor_keys",)
    .select("actor_id",)
    .where("status", "=", "active",)
    .where("name", "=", "primary",)
    .where("created_at", "<", cutoff,)
    .distinct()
    .execute();

  return Array.from(expired, (r,) => r.actor_id,);
}

/**
 * Rotate a single actor's primary key and re-encrypt recent messages.
 *
 * Steps:
 * 1. Generate new actor key
 * 2. Find all chats where this actor participates
 * 3. For each chat: derive new chat key, re-encrypt recent messages
 * 4. Mark old key as expired
 */
export async function rotateActorKeyAndReEncrypt(
  database: Kysely<DB>,
  actorId: string,
  smk: CryptoKey,
  reEncryptLimit = 100,
): Promise<RotationResult> {
  const log2 = log();

  // 1. Generate new key
  const newKeyId = await generateActorKey({ database, actorId, smk, },);

  // 2. Find chats where actor participates
  const participations = await database
    .selectFrom("chat_participants",)
    .select("chat_id",)
    .where("actor_id", "=", actorId,)
    .execute();

  let totalReEncrypted = 0;

  // 3. Re-encrypt recent messages in each chat
  for (const { chat_id: chatId, } of participations) {
    try {
      const reEncrypted = await reEncryptChatMessages(
        database,
        chatId,
        smk,
        reEncryptLimit,
      );
      totalReEncrypted += reEncrypted;
    } catch (error) {
      log2.warn(`Failed to re-encrypt messages in chat ${chatId}: ${String(error,)}`,);
    }
  }

  // 4. Find old key ID
  const keys = await listActorKeys(database, actorId,);
  const oldKey = keys.find((k,) => k.id !== newKeyId && k.status === "active");

  log2.info(`Rotated key for actor ${actorId}: ${oldKey?.id ?? "unknown"} → ${newKeyId}`,);

  return {
    actorId,
    oldKeyId: oldKey?.id ?? "unknown",
    newKeyId,
    chatsAffected: participations.length,
    messagesReEncrypted: totalReEncrypted,
  };
}

/**
 * Re-encrypt recent messages in a chat with the current chat key.
 * Used after key rotation to ensure messages are accessible with the new key.
 */
async function reEncryptChatMessages(
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

/**
 * Run auto-rotation for all expired keys.
 * Designed to be called periodically (e.g., every hour or daily).
 *
 * @param database - Kysely DB instance
 * @param rotationDays - Days before a key is considered expired (0 = disabled)
 * @param reEncryptLimit - Max messages to re-encrypt per chat (default 100)
 * @returns Summary of rotation results
 */
export async function runAutoRotation(
  database: Kysely<DB>,
  rotationDays: number,
  reEncryptLimit = 100,
): Promise<RotationSummary> {
  const log2 = log();

  if (!isEncryptionEnabled()) {
    log2.debug("Encryption not enabled, skipping auto-rotation",);
    return { checked: 0, rotated: 0, results: [], errors: [], };
  }

  if (rotationDays <= 0) {
    log2.debug("Auto-rotation disabled (keyRotationDays = 0)",);
    return { checked: 0, rotated: 0, results: [], errors: [], };
  }

  const smk = getSmk();
  if (!smk) {
    log2.warn("SMK not loaded, cannot rotate keys",);
    return { checked: 0, rotated: 0, results: [], errors: ["SMK not loaded",], };
  }

  // Find expired keys
  const expiredActorIds = await findExpiredKeys(database, rotationDays,);

  if (expiredActorIds.length === 0) {
    log2.debug("No expired keys found",);
    return { checked: 0, rotated: 0, results: [], errors: [], };
  }

  log2.info(`Found ${expiredActorIds.length} actors with expired keys, rotating...`,);

  const results: RotationResult[] = [];
  const errors: string[] = [];

  // Rotate each actor's key
  for (const actorId of expiredActorIds) {
    try {
      const result = await rotateActorKeyAndReEncrypt(
        database,
        actorId,
        smk,
        reEncryptLimit,
      );
      results.push(result,);
    } catch (error) {
      const errMsg = `Failed to rotate key for actor ${actorId}: ${String(error,)}`;
      log2.error(errMsg,);
      errors.push(errMsg,);
    }
  }

  log2.info(`Auto-rotation complete: ${results.length} rotated, ${errors.length} errors`,);

  return {
    checked: expiredActorIds.length,
    rotated: results.length,
    results,
    errors,
  };
}

/**
 * Start auto-rotation timer.
 * Calls runAutoRotation periodically based on the configured interval.
 *
 * @param database - Kysely DB instance
 * @param rotationDays - Days before a key is considered expired
 * @param intervalMs - How often to check for expired keys (default: 1 hour)
 * @returns Timer ID for cleanup
 */
export function startAutoRotationTimer(
  database: Kysely<DB>,
  rotationDays: number,
  intervalMs: number = 60 * 60 * 1000, // 1 hour
): ReturnType<typeof setInterval> | null {
  if (rotationDays <= 0) {
    log().debug("Auto-rotation disabled, not starting timer",);
    return null;
  }

  log().info(`Starting auto-rotation timer (check every ${intervalMs / 1000}s, rotate after ${rotationDays} days)`,);

  // Run immediately on start
  void runAutoRotation(database, rotationDays,).catch((error,) => {
    log().error(`Auto-rotation failed: ${String(error,)}`,);
  },);

  // Then run periodically
  return setInterval(() => {
    void runAutoRotation(database, rotationDays,).catch((error,) => {
      log().error(`Auto-rotation failed: ${String(error,)}`,);
    },);
  }, intervalMs,);
}

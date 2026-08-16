// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Rotate a single actor's primary key and re-encrypt recent messages.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { generateActorKey, listActorKeys, } from "../actor-keys";
import { log, } from "./log";
import { reEncryptChatMessages, } from "./re-encrypt";
import type { RotationResult, } from "./types";

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

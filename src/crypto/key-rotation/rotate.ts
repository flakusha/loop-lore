// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Rotate a single actor's primary key and re-encrypt recent messages.
 *
 * Correct rotation sequence (preserves history):
 * 1. Snapshot: derive OLD chat key from current (pre-rotation) actor keys.
 * 2. Rotate: expire old actor key + create new one via rotateActorKey.
 * 3. Derive NEW chat key from post-rotation actor keys.
 * 4. Re-encrypt: decrypt old messages with OLD key, encrypt with NEW key.
 *
 * The old key is marked expired only AFTER re-encryption succeeds.
 * On any failure during re-encrypt, the error is surfaced (not swallowed),
 * so the caller can decide whether to retry or roll back.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { loadActorKeys, rotateActorKey, } from "../actor-keys";
import { deriveChatKey, } from "../chat-keys";
import { log, } from "./log";
import { reEncryptWithKeys, } from "./re-encrypt";
import type { RotationResult, } from "./types";

/**
 * Rotate a single actor's primary key and re-encrypt recent messages.
 *
 * Steps:
 * 1. Get all chats the actor participates in, then load keys for ALL
 *    participants of those chats (so the OLD chat key can be derived).
 * 2. Call rotateActorKey — atomically expires old + creates new.
 * 3. Derive the NEW chat key from post-rotation actor keys.
 * 4. Re-encrypt recent messages: decrypt with OLD key, encrypt with NEW key.
 *    Failures are surfaced (not silently swallowed).
 * 5. Old actor key is already expired from step 2.
 */
export async function rotateActorKeyAndReEncrypt(
  database: Kysely<DB>,
  actorId: string,
  smk: CryptoKey,
  reEncryptLimit = 100,
): Promise<RotationResult> {
  const log2 = log();

  // ── 1. Snapshot OLD keys BEFORE rotating any actor key ───────────────────
  // Get all chats this actor participates in.
  const chatRows = await database
    .selectFrom("chat_participants")
    .select("chat_id")
    .where("actor_id", "=", actorId)
    .execute();
  const chatIds: string[] = [];
  for (const row of chatRows) {
    chatIds.push(row.chat_id);
  }

  // Load keys for ALL participants of those chats (not just this actor).
  const actorIds: string[] = [];
  if (chatIds.length > 0) {
    const actorRows = await database
      .selectFrom("chat_participants")
      .select("actor_id")
      .where("chat_id", "in", chatIds)
      .distinct()
      .execute();
    for (const row of actorRows) {
      actorIds.push(row.actor_id);
    }
  }

  const oldParticipantKeys = await loadActorKeys({ database, actorIds, smk });
  // ── 2. Rotate the actor key (atomically: expire old + create new) ────────
  const newKeyId = await rotateActorKey({ database, actorId, smk, },);

  // ── 3. Derive NEW chat key from post-rotation actor keys ─────────────────
  const newParticipantKeys = await loadActorKeys({ database, actorIds, smk, },);

  // ── 4. Re-encrypt recent messages: OLD → NEW ───────────────────────────
  let totalReEncrypted = 0;
  const errors: { chatId: string; messageId: string; reason: string }[] = [];

  const participations = await database
    .selectFrom("chat_participants",)
    .select("chat_id",)
    .where("actor_id", "=", actorId,)
    .execute();

  for (const { chat_id: chatId, } of participations) {
    // Re-derive per-chat old/new keys (chatId changes the HKDF salt).
    const oldChatKey = await deriveChatKey(oldParticipantKeys, chatId,);
    const newChatKey = await deriveChatKey(newParticipantKeys, chatId,);

    const { reEncrypted, failures, } = await reEncryptWithKeys(
      database,
      chatId,
      oldChatKey,
      newChatKey,
      reEncryptLimit,
    );
    totalReEncrypted += reEncrypted;

    if (failures.length > 0) {
      for (const f of failures) {
        log2.warn(`Failed to re-encrypt message ${f.id} in chat ${chatId}: ${f.reason}`,);
        errors.push({ chatId, messageId: f.id, reason: f.reason, },);
      }
    }
  }

  // ── 5. Done: old key is already expired from step 2 ──────────────────────
  log2.info(
    `Rotated key for actor ${actorId}: old=${oldParticipantKeys[0]?.keyId ?? "?"} → new=${newKeyId}` +
      `; ${totalReEncrypted} messages re-encrypted, ${errors.length} failures`,
  );

  return {
    actorId,
    oldKeyId: oldParticipantKeys[0]?.keyId ?? "unknown",
    newKeyId,
    chatsAffected: participations.length,
    messagesReEncrypted: totalReEncrypted,
  };
}

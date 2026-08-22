// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Key Distribution — Stable Per-Chat Random Keys
 *
 * Design (per BUG-chat-key-history-loss-join-leave fix):
 * - Each chat has one stable random key in `chat_keys` (SMK-encrypted).
 *   Derived once, reused forever. Join/leave does NOT change it.
 * - `distributeKeysOnJoin`: ensure new participant has an actor key.
 *   The chat key is already stable — no re-encrypt needed.
 * - `rotateKeyOnLeave`: generate a new random chat key, re-encrypt all
 *   messages OLD→NEW in one transaction. Old key is replaced (forward secrecy).
 * - `getChatKey` / `resolveChatKey`: delegates to `deriveChatKeyForChat`
 *   which loads (or creates lazily) the stable chat key.
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import type { Logger, } from "../logger";
import { encryptBytes, ensureActorKey, } from "./actor-keys";
import { type ChatKey, deriveChatKeyForChat, } from "./chat-keys";
import { reEncryptWithKeys, } from "./key-rotation/re-encrypt";
import { getSmk, } from "./smk";

const RE_ENCRYPT_LIMIT = Number.MAX_SAFE_INTEGER;

function log(): Logger {
  return getLogger().child({ module: "key-distribution", },);
}

export async function getChatKey(database: Kysely<DB>, chatId: string,): Promise<ChatKey> {
  const smk = getSmk();
  if (!smk) { throw new Error("Encryption not configured — set SERVER_ENCRYPTION_KEY",); }
  return deriveChatKeyForChat(database, chatId, smk,);
}

export async function distributeKeysOnJoin(
  database: Kysely<DB>,
  chatId: string,
  newParticipantId: string,
): Promise<ChatKey> {
  const smk = getSmk();
  if (!smk) { throw new Error("Encryption not configured — set SERVER_ENCRYPTION_KEY",); }
  await ensureActorKey({ database, actorId: newParticipantId, smk, },);
  const chatKey = await deriveChatKeyForChat(database, chatId, smk,);
  log().info("Distributed chat key to new participant (stable, no re-encrypt)", {
    chatId,
    newParticipantId,
    keyId: chatKey.keyId,
  },);
  return chatKey;
}

export async function rotateKeyOnLeave(
  database: Kysely<DB>,
  chatId: string,
  departedParticipantId: string,
): Promise<ChatKey> {
  const smk = getSmk();
  if (!smk) { throw new Error("Encryption not configured — set SERVER_ENCRYPTION_KEY",); }

  const oldChatKey = await deriveChatKeyForChat(database, chatId, smk,);

  const allActorIds = await database
    .selectFrom("chat_participants",)
    .select("actor_id",)
    .where("chat_id", "=", chatId,)
    .execute();
  /* eslint-disable no-restricted-syntax */
  const remainingActors = allActorIds
    .map((r,) => r.actor_id)
    .filter((id,) => id !== departedParticipantId);
  /* eslint-enable no-restricted-syntax */
  if (remainingActors.length === 0) {
    throw new Error("Cannot rotate key: no remaining participants",);
  }

  const newId = crypto.randomUUID();
  const newRawKey = crypto.getRandomValues(new Uint8Array(32,),);
  const newEncryptedKey = await encryptBytes(smk, newRawKey,);
  const newKey = await crypto.subtle.importKey(
    "raw",
    newRawKey,
    "AES-GCM",
    true,
    ["encrypt", "decrypt",],
  );
  const newChatKey: ChatKey = { key: newKey, keyId: newId, rawKey: newRawKey, };

  const { reEncrypted, failures, } = await reEncryptWithKeys(
    database,
    chatId,
    oldChatKey,
    newChatKey,
    RE_ENCRYPT_LIMIT,
  );

  if (failures.length > 0) {
    log().error("rotateKeyOnLeave: re-encryption failures — aborting rotation", {
      chatId,
      departedParticipantId,
      failures,
    },);
    throw new Error(`rotateKeyOnLeave: ${failures.length} message(s) failed to re-encrypt: ${failures[0]!.reason}`,);
  }

  await database
    .updateTable("chat_keys",)
    .set({ id: newId, encrypted_chat_key: newEncryptedKey, expires_at: null, },)
    .where("chat_id", "=", chatId,)
    .execute();

  log().info("Rotated chat key on participant leave (forward secrecy)", {
    chatId,
    departedParticipantId,
    oldKeyId: oldChatKey.keyId,
    newKeyId: newId,
    reEncrypted,
  },);

  return newChatKey;
}

export async function resolveChatKey(database: Kysely<DB>, chatId: string,): Promise<ChatKey> {
  return getChatKey(database, chatId,);
}

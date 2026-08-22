// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat Key Derivation — Stable Per-Chat Random Keys
 *
 * Design:
 * - Each chat has one random AES-256-GCM key stored in `chat_keys`, encrypted
 *   with the SMK. This key NEVER changes due to join/leave.
 * - `deriveChatKeyForChat` loads or creates this key lazily.
 * - `getChatKeyById` resolves a `messages.key_id` (a `chat_keys.id`) to a
 *   `ChatKey` for decryption — no re-derivation needed.
 * - `deriveChatKey(participantKeys, chatId)` is preserved for the key-rotation
 *   path (`rotateActorKeyAndReEncrypt`) which uses HKDF-from-participants as
 *   its own forward-secrecy mechanism; do NOT remove it.
 * - `getChatParticipantActorIds` is preserved for non-crypto callers.
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { decryptBytes, encryptBytes, } from "./actor-keys";
import type { ActorKeyData, } from "./actor-keys";

const HKDF_INFO = "loop-lore-chat-key-v1";

export interface ChatKey {
  key: CryptoKey;
  keyId: string;
  rawKey: Uint8Array;
}

export async function getChatParticipantActorIds(database: Kysely<DB>, chatId: string,): Promise<string[]> {
  const rows = await database
    .selectFrom("chat_participants",)
    .select("actor_id",)
    .where("chat_id", "=", chatId,)
    .orderBy("actor_id", "asc",)
    .execute();
  return Array.from(rows, (r,) => r.actor_id,);
}

export async function deriveChatKey(participantKeys: ActorKeyData[], chatId: string,): Promise<ChatKey> {
  if (participantKeys.length === 0) {
    throw new Error("Cannot derive chat key: no participant keys",);
  }
  const ikmLength = participantKeys.length * 32;
  const ikm = new Uint8Array(ikmLength,);
  for (const [index, participantKey,] of participantKeys.entries()) {
    ikm.set(participantKey.rawKey, index * 32,);
  }
  const keyMaterial = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveKey",],);
  const salt = new TextEncoder().encode(chatId,);
  const info = new TextEncoder().encode(HKDF_INFO,);
  const derived = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info, },
    keyMaterial,
    { name: "AES-GCM", length: 256, },
    true,
    ["encrypt", "decrypt",],
  );
  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", derived,),);
  return { key: derived, keyId: participantKeys[0]!.keyId, rawKey, };
}

export async function getChatKeyById(
  database: Kysely<DB>,
  keyId: string,
  smk: CryptoKey,
): Promise<ChatKey | null> {
  const row = await database
    .selectFrom("chat_keys",)
    .selectAll()
    .where("id", "=", keyId,)
    .executeTakeFirst();
  if (!row?.encrypted_chat_key) { return null; }
  const rawKey = await decryptBytes(smk, row.encrypted_chat_key,);
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", true, ["encrypt", "decrypt",],);
  return { key, keyId: row.id, rawKey, };
}

export async function deriveChatKeyForChat(
  database: Kysely<DB>,
  chatId: string,
  smk: CryptoKey,
): Promise<ChatKey> {
  const existing = await database
    .selectFrom("chat_keys",)
    .selectAll()
    .where("chat_id", "=", chatId,)
    .executeTakeFirst();
  if (existing?.encrypted_chat_key) {
    const rawKey = await decryptBytes(smk, existing.encrypted_chat_key,);
    const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", true, ["encrypt", "decrypt",],);
    return { key, keyId: existing.id, rawKey, };
  }
  const id = crypto.randomUUID();
  const rawKey = crypto.getRandomValues(new Uint8Array(32,),);
  const encryptedChatKey = await encryptBytes(smk, rawKey,);
  await database.insertInto("chat_keys",).values({
    id,
    chat_id: chatId,
    encrypted_chat_key: encryptedChatKey,
    created_at: new Date().toISOString(),
    expires_at: null,
  },).execute();
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", true, ["encrypt", "decrypt",],);
  return { key, keyId: id, rawKey, };
}

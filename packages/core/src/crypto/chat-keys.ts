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

import type { DB, } from "@/db/schema";
import type { Kysely, } from "kysely";
import { decryptBytes, encryptBytes, } from "./actor-key-bytes";
import type { ActorKeyData, } from "./actor-keys";
import { decryptThenDecompress, extractKeyIdFromPayload, } from "./pipeline";
import { getSmk, } from "./smk";

const HKDF_INFO = "loop-lore-chat-key-v1";

/** */
export interface ChatKey {
  key: CryptoKey;
  keyId: string;
  rawKey: Uint8Array;
}

/**
 * @param database
 * @param chatId
 * @returns string
 */
export async function getChatParticipantActorIds(database: Kysely<DB>, chatId: string,): Promise<string[]> {
  const rows = await database
    .selectFrom("chat_participants",)
    .select("actor_id",)
    .where("chat_id", "=", chatId,)
    .orderBy("actor_id", "asc",)
    .execute();

  return Array.from(rows, (r,) => r.actor_id,);
}

/**
 * @param participantKeys
 * @param chatId
 * @returns void
 * @throws {Error}
 */
export async function deriveChatKey(participantKeys: ActorKeyData[], chatId: string,): Promise<ChatKey> {
  if (participantKeys.length === 0) {
    throw new Error("Cannot derive chat key: no participant keys",);
  }

  const ikmLength = participantKeys.length * 32;
  const ikm = new Uint8Array(ikmLength,);
  for (let i = 0; i < participantKeys.length; i++) {
    const participantKey = participantKeys[i]!;
    ikm.set(participantKey.rawKey, i * 32,);
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

/**
 * @param database
 * @param keyId
 * @param smk
 * @returns void
 */
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
  const key = await crypto.subtle.importKey(
    "raw",
    rawKey as unknown as Parameters<typeof crypto.subtle.importKey>[1],
    "AES-GCM",
    true,
    ["encrypt", "decrypt",],
  );

  return { key, keyId: row.id, rawKey, };
}

/**
 * True when `keyId` is a LIVE key of `chatId` (a `chat_keys` row owned by
 * that chat).
 *
 * A client may pre-encrypt a message body and name the key it used in the
 * payload envelope. That `key_id` used to be persisted unvalidated, so any
 * forged id reached `messages.key_id` — and a row nobody can decrypt made
 * `rotateKeyOnLeave` fail forever, wedging the chat (BE-1).
 *
 * Only `standard`-tier chats hold chat keys (and only they rotate on
 * leave), so only they are validated. A chat with no `chats` row at all is
 * not a chat the caller can write into (the request is rejected further up
 * the stack), so there is nothing to validate against and the id is
 * accepted.
 * @param database
 * @param chatId
 * @param keyId
 * @returns {Promise<boolean>}
 */
export async function isLiveChatKeyId(
  database: Kysely<DB>,
  chatId: string,
  keyId: string | null,
): Promise<boolean> {
  if (!keyId) { return false; }

  const chat = await database
    .selectFrom("chats",)
    .select(["id", "encryption_level",],)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  if (!chat) { return true; }

  if (chat.encryption_level !== "standard") { return true; }

  const live = await database
    .selectFrom("chat_keys",)
    .select("id",)
    .where("id", "=", keyId,)
    .where("chat_id", "=", chatId,)
    .executeTakeFirst();

  return !!live;
}

/**
 * @param database
 * @param chatId
 * @param smk
 * @returns void
 * @throws {Error}
 */
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
    const key = await crypto.subtle.importKey(
      "raw",
      rawKey as unknown as Parameters<typeof crypto.subtle.importKey>[1],
      "AES-GCM",
      true,
      ["encrypt", "decrypt",],
    );

    return { key, keyId: existing.id, rawKey, };
  }

  const id = crypto.randomUUID();
  const rawKey = crypto.getRandomValues(new Uint8Array(32,),);
  const encryptedChatKey = await encryptBytes(smk, rawKey,);
  // Concurrent first-message derives can both see "no row" and INSERT.
  // `chat_keys.chat_id` is unique (idx_chat_keys_chat_id); retry once on a
  // constraint violation by re-reading the winner's row instead of failing.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await database.insertInto("chat_keys",).values({
        id,
        chat_id: chatId,
        encrypted_chat_key: encryptedChatKey,
        created_at: new Date().toISOString(),
        expires_at: null,
      },).execute();

      break;
    } catch (error) {
      if (attempt === 1) { throw error; }
      const winner = await database
        .selectFrom("chat_keys",)
        .selectAll()
        .where("chat_id", "=", chatId,)
        .executeTakeFirst();

      if (winner?.encrypted_chat_key) {
        const rawKey2 = await decryptBytes(smk, winner.encrypted_chat_key,);
        const key2 = await crypto.subtle.importKey(
          "raw",
          rawKey2 as unknown as Parameters<typeof crypto.subtle.importKey>[1],
          "AES-GCM",
          true,
          ["encrypt", "decrypt",],
        );

        return { key: key2, keyId: winner.id, rawKey: rawKey2, };
      }
      // No winner yet — the other insert also raced; retry the INSERT.
    }
  }

  const key = await crypto.subtle.importKey(
    "raw",
    rawKey as unknown as Parameters<typeof crypto.subtle.importKey>[1],
    "AES-GCM",
    true,
    ["encrypt", "decrypt",],
  );

  return { key, keyId: id, rawKey, };
}

/**
 * Outcome of validating a client-supplied encrypted payload.
 *
 * `stale` marks the RECOVERABLE rejection: the payload named a key that is
 * not live for this chat (the chat key was rotated when a participant left),
 * so the client can refetch the key, re-encrypt and retry. A `stale: false`
 * rejection is a forged payload — refetching would not help.
 */
export type ClientPayloadValidation =
  | { ok: true; keyId: string }
  | { ok: false; reason: string; stale: boolean };

/**
 * Validate a client-supplied encrypted payload before it is stored.
 *
 * The `key_id` in the envelope is CLIENT supplied, and it used to reach
 * `messages.key_id` unvalidated. A forged id — or the LIVE key id paired
 * with ciphertext nobody can decrypt — produced a row that wedged
 * `rotateKeyOnLeave` forever: the chat could never be rotated again, so the
 * removed member kept the live key (BE-1).
 *
 * A `standard`-tier chat holds a server-side chat key, so the server can
 * check BOTH halves of the claim: the id must name a live key of THIS chat,
 * and the payload must actually decrypt under it. `at-rest` / `none` chats
 * use a key the server never sees and never rotates — there is nothing to
 * verify there.
 * @param database
 * @param chatId
 * @param payload
 * @returns {Promise<ClientPayloadValidation>}
 */
export async function validateClientEncryptedPayload(
  database: Kysely<DB>,
  chatId: string,
  payload: string,
): Promise<ClientPayloadValidation> {
  const keyId = extractKeyIdFromPayload(payload,);
  if (!keyId) {
    return { ok: false, reason: "Encrypted content names no key", stale: false, };
  }

  if (!(await isLiveChatKeyId(database, chatId, keyId,))) {
    return {
      ok: false,
      reason: "Encrypted content names a key that is not a live key of this chat",
      stale: true,
    };
  }

  const chat = await database
    .selectFrom("chats",)
    .select("encryption_level",)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  // No chat row, or a chat whose key the server never holds: nothing to verify.
  if (!chat || chat.encryption_level !== "standard") { return { ok: true, keyId, }; }

  const smk = getSmk();
  if (!smk) {
    return { ok: false, reason: "Encryption is not configured on this server", stale: false, };
  }

  const chatKey = await getChatKeyById(database, keyId, smk,);
  if (!chatKey) {
    return { ok: false, reason: "Encrypted content names an unreadable chat key", stale: false, };
  }

  // The id is live, so the payload must decrypt under it. A live id paired
  // with garbage ciphertext is the other half of the wedge: it would be
  // stored as a row nobody can decrypt (BE-1).
  try {
    await decryptThenDecompress(payload, chatKey.key,);
  } catch {
    return {
      ok: false,
      reason: "Encrypted content cannot be decrypted with the chat key",
      stale: false,
    };
  }

  return { ok: true, keyId, };
}

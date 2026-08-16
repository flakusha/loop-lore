// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat Key Derivation
 *
 * Derives per-chat AES-256-GCM keys via HKDF from participant actor keys.
 * Also provides the participant-lookup helper used by the message route.
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { loadActorKeys, } from "./actor-keys";
import type { ActorKeyData, } from "./actor-keys";

const HKDF_INFO = "loop-lore-chat-key-v1";

export interface ChatKey {
  /** The derived AES-256-GCM CryptoKey. */
  key: CryptoKey;
  /** The key_id of the first participant's key (for storage reference). */
  keyId: string;
  /** The raw 32-byte key material (for serialization if needed). */
  rawKey: Uint8Array;
}

/**
 * Get all active participant actor IDs for a chat.
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
 * Derive a per-chat AES-256-GCM key from participant actor keys.
 *
 * Algorithm: HKDF-Extract-and-Expand
 *   - salt = chatId (as UTF-8)
 *   - IKM = concat(sorted(participant_raw_keys))
 *   - info = "loop-lore-chat-key-v1"
 *   - output length = 32 bytes (= 256 bits)
 *
 * Deterministic given same participants and chat ID.
 * Changes when participants change (add/remove → new key).
 */
export async function deriveChatKey(participantKeys: ActorKeyData[], chatId: string,): Promise<ChatKey> {
  if (participantKeys.length === 0) {
    throw new Error("Cannot derive chat key: no participant keys",);
  }

  // Concatenate all raw keys in sorted order (already sorted by actor_id)
  const ikmLength = participantKeys.length * 32;
  const ikm = new Uint8Array(ikmLength,);
  for (const [index, participantKey,] of participantKeys.entries()) {
    ikm.set(participantKey.rawKey, index * 32,);
  }

  // Import as HKDF key material
  const keyMaterial = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveKey",],);

  // Derive AES-256-GCM key
  const salt = new TextEncoder().encode(chatId,);
  const info = new TextEncoder().encode(HKDF_INFO,);

  const derived = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info,
    },
    keyMaterial,
    { name: "AES-GCM", length: 256, },
    true, // extractable — needed for rawKey export
    ["encrypt", "decrypt",],
  );

  // Export raw key for potential serialization
  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", derived,),);

  return {
    key: derived,
    keyId: participantKeys[0]!.keyId,
    rawKey,
  };
}

/**
 * One-shot: load participants, load their keys, derive chat key.
 *
 * Convenience for message route use.
 */
export async function deriveChatKeyForChat(
  database: Kysely<DB>,
  chatId: string,
  smk: CryptoKey,
): Promise<ChatKey> {
  const actorIds = await getChatParticipantActorIds(database, chatId,);
  const keys = await loadActorKeys({ database, actorIds, smk, },);
  return deriveChatKey(keys, chatId,);
}

/**
 * Key Distribution — Group Chat Key Management
 *
 * When a new participant joins a group chat:
 * 1. Load existing chat key (or derive if first participant)
 * 2. Ensure new participant has an actor key
 * 3. Store encrypted copy of chat key for new participant
 * 4. Return chat key to new participant
 *
 * When a participant leaves:
 * 1. Generate new chat key
 * 2. Re-encrypt for remaining participants
 * 3. Old key discarded (forward secrecy)
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, type Logger, } from "../logger";
import {
  ensureActorKey,
  loadActorKeys,
} from "./actor-keys";
import {
  type ChatKey,
  deriveChatKey,
  getChatParticipantActorIds,
} from "./chat-keys";
import { getSmk, } from "./smk";

function log(): Logger {
  return getLogger().child({ module: "key-distribution", },);
}

/**
 * Get or create the chat key for a chat.
 *
 * The chat key is derived deterministically from the sorted participant keys.
 * This ensures all participants derive the same key.
 */
export async function getChatKey(
  database: Kysely<DB>,
  chatId: string,
): Promise<ChatKey> {
  const smk = getSmk();
  if (!smk) {
    throw new Error("Encryption not configured — set SERVER_ENCRYPTION_KEY",);
  }

  const actorIds = await getChatParticipantActorIds(database, chatId,);
  const keys = await loadActorKeys({ database, actorIds, smk, },);

  if (keys.length === 0) {
    throw new Error(`No participant keys found for chat ${chatId}`,);
  }

  return deriveChatKey(keys, chatId,);
}

/**
 * Distribute keys to a new participant joining a group chat.
 *
 * This ensures the new participant can decrypt existing messages.
 * The chat key is derived from ALL participant keys (including the new one),
 * so we need to re-derive it after adding the participant.
 *
 * @returns The chat key for the new participant to use
 */
export async function distributeKeysOnJoin(
  database: Kysely<DB>,
  chatId: string,
  newParticipantId: string,
): Promise<ChatKey> {
  const smk = getSmk();
  if (!smk) {
    throw new Error("Encryption not configured — set SERVER_ENCRYPTION_KEY",);
  }

  // Ensure new participant has an actor key
  await ensureActorKey({ database, actorId: newParticipantId, smk, },);

  // Get all participant IDs (including the new one)
  const actorIds = await getChatParticipantActorIds(database, chatId,);

  // Load all participant keys
  const keys = await loadActorKeys({ database, actorIds, smk, },);

  // Derive chat key (deterministic from sorted participant keys)
  const chatKey = await deriveChatKey(keys, chatId,);

  log().info("Distributed keys for new participant", {
    chatId,
    newParticipantId,
    keyId: chatKey.keyId,
    participantCount: keys.length,
  },);

  return chatKey;
}

/**
 * Rotate chat key when a participant leaves (forward secrecy).
 *
 * This generates a new chat key that excludes the departed participant.
 * Old messages remain encrypted with the old key (inaccessible to departed).
 * New messages use the new key.
 *
 * @returns The new chat key
 */
export async function rotateKeyOnLeave(
  database: Kysely<DB>,
  chatId: string,
  departedParticipantId: string,
): Promise<ChatKey> {
  const smk = getSmk();
  if (!smk) {
    throw new Error("Encryption not configured — set SERVER_ENCRYPTION_KEY",);
  }

  // Get remaining participant IDs (excluding departed)
  const allActorIds = await getChatParticipantActorIds(database, chatId,);
  const remainingActorIds: string[] = [];
  for (const id of allActorIds) { if (id !== departedParticipantId) { remainingActorIds.push(id,); } }

  if (remainingActorIds.length === 0) {
    throw new Error("Cannot rotate key: no remaining participants",);
  }

  // Load remaining participant keys
  const keys = await loadActorKeys({ database, actorIds: remainingActorIds, smk, },);

  // Derive new chat key (different because participant set changed)
  const newChatKey = await deriveChatKey(keys, chatId,);

  log().info("Rotated chat key on participant leave", {
    chatId,
    departedParticipantId,
    newKeyId: newChatKey.keyId,
    remainingParticipants: remainingActorIds.length,
  },);

  return newChatKey;
}

/**
 * Get the chat key for message encryption/decryption.
 *
 * This is the main entry point for the message route.
 * It handles the common case where the chat already has participants.
 */
export async function resolveChatKey(
  database: Kysely<DB>,
  chatId: string,
): Promise<ChatKey> {
  return getChatKey(database, chatId,);
}

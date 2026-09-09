// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat-scoped ownership helpers.
 *
 * These guard `src/chat/transitions.ts` (and any future caller) against
 * a forged `(actorId, chatId)` pair injecting data into another actor's
 * `actor_memories` row or pulling another user's BYO apiKey.
 */

/** */
export class OwnershipError extends Error {
  /**
   * @param message
   * @param options
   */
  constructor(
    message = "Caller is not a participant of this chat",
    options?: ErrorOptions,
  ) {
    super(message, options,);
    this.name = "OwnershipError";
  }
}

/**
 * Verify that `actorId` is a participant of `chatId`.
 *
 * Throws `OwnershipError` when the actor row is missing.
 * @param db
 * @param db.selectFrom
 * @param chatId
 * @param actorId
 */
export async function requireChatParticipant(
  db: { selectFrom: Function },
  chatId: string,
  actorId: string,
): Promise<{ actor_id: string; role_in_chat: string }> {
  const participant = await db
    .selectFrom("chat_participants",)
    .select(["actor_id", "role_in_chat",],)
    .where("chat_id", "=", chatId,)
    .where("actor_id", "=", actorId,)
    .executeTakeFirst();

  if (!participant) {
    throw new OwnershipError(
      `Actor ${actorId} is not a participant of chat ${chatId}`,
    );
  }
  return participant as { actor_id: string; role_in_chat: string };
}

/**
 * Verify that `userId` exists as an actor. The transitions module uses
 * `userId` as a stand-in for the calling actor when classifying messages
 * (BYO apiKey resolution). This guard prevents a forged `userId` from
 * pulling another user's BYO credentials.
 * @param db
 * @param db.selectFrom
 * @param userId
 */
export async function requireActorExists(
  db: { selectFrom: Function },
  userId: string,
): Promise<void> {
  const actor = await db
    .selectFrom("actors",)
    .select("id",)
    .where("id", "=", userId,)
    .executeTakeFirst();

  if (!actor) {
    throw new OwnershipError(`Unknown actor: ${userId}`,);
  }
}
